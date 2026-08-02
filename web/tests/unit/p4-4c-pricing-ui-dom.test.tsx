// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PriceListCreateClient } from "../../src/app/(authenticated)/admin/pricing/price-list-create-client";
import { PricingManagerClient } from "../../src/app/(authenticated)/admin/pricing/[id]/pricing-manager-client";

const failedResponse = (message: string) => ({ ok: false, json: async () => ({ error: { message } }) }) as Response;
const priceList = {
  id: "price-list-a", code: "RETAIL", name: "零售價", status: "ACTIVE" as const,
  itemPrices: [{ id: "price-a", itemId: "item-a", unitPrice: "123.45000", validFrom: "2026-08-01", validTo: null, status: "ACTIVE" as const, item: { code: "ITEM-001", name: "測試品項" } }],
  assignments: [{ id: "assignment-a", customerId: "customer-a", validFrom: "2026-08-01", validTo: null, status: "ACTIVE" as const, customer: { name: "測試客戶" } }],
};

beforeEach(() => vi.stubGlobal("crypto", { randomUUID: () => "test-idempotency-key" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("P4.4c Pricing DOM interaction", () => {
  it("preserves price-list create payload, pending and API error", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PriceListCreateClient companyId="company-a" />);
    fireEvent.change(screen.getByLabelText(/價格表代碼/), { target: { value: "RETAIL" } });
    fireEvent.change(screen.getByLabelText(/價格表名稱/), { target: { value: "零售價" } });
    const submit = screen.getByRole("button", { name: "建立價格表" });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/price-lists");
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({ companyId: "company-a", priceList: { code: "RETAIL", name: "零售價" } });
    resolveRequest(failedResponse("價格表代碼重複"));
    expect((await screen.findByRole("alert")).textContent).toContain("價格表代碼重複");
  });

  it("recovers price-list create after a rejected fetch", async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    })));
    render(<PriceListCreateClient companyId="company-a" />);
    fireEvent.change(screen.getByLabelText(/價格表代碼/), { target: { value: "RETAIL" } });
    fireEvent.change(screen.getByLabelText(/價格表名稱/), { target: { value: "零售價" } });
    const submit = screen.getByRole("button", { name: "建立價格表" });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    rejectRequest(new Error("網路連線失敗"));
    expect((await screen.findByRole("alert")).textContent).toContain("網路連線失敗");
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(submit.getAttribute("aria-busy")).toBeNull();
  });

  it("preserves all manager methods, targets and validity payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(failedResponse("測試錯誤"));
    vi.stubGlobal("fetch", fetchMock);
    render(<PricingManagerClient priceList={priceList} companyId="company-a" items={[{ id: "item-a", label: "ITEM-001－測試品項" }]} customers={[{ id: "customer-a", label: "測試客戶" }]} />);
    const actions = [
      ["儲存價格表", "/api/admin/price-lists/price-list-a", "PATCH"],
      ["新增版本", "/api/admin/price-lists/price-list-a/prices", "POST"],
      ["新增指派", "/api/admin/customer-price-list-assignments", "POST"],
    ] as const;
    for (const [label, expectedUrl, method] of actions) {
      fetchMock.mockClear();
      const button = screen.getByRole("button", { name: label });
      const form = button.closest("form")!;
      for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[required]'))) if (!input.value) fireEvent.change(input, { target: { value: input.type === "date" ? "2026-08-01" : "1.00000" } });
      fireEvent.submit(form);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(expectedUrl);
      expect(options.method).toBe(method);
      expect(JSON.parse(String(options.body)).companyId).toBe("company-a");
      await screen.findByRole("alert");
    }
    const adjustmentButtons = screen.getAllByRole("button", { name: "調整期間" });
    for (const [index, expectedUrl] of [[0, "/api/admin/item-prices/price-a"], [1, "/api/admin/customer-price-list-assignments/assignment-a"]] as const) {
      fetchMock.mockClear();
      fireEvent.submit(adjustmentButtons[index].closest("form")!);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(expectedUrl);
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(String(options.body))).toMatchObject({ companyId: "company-a", adjustment: { validFrom: "2026-08-01", validTo: "", status: "ACTIVE" } });
    }
  });
});
