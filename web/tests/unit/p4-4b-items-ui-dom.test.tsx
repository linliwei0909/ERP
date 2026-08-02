// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemCreateClient } from "../../src/app/(authenticated)/admin/items/item-create-client";
import { ItemManagerClient } from "../../src/app/(authenticated)/admin/items/[id]/item-manager-client";

const failedResponse = (message: string) => ({
  ok: false,
  json: async () => ({ error: { message } }),
}) as Response;

const managedItem = {
  id: "item-a",
  code: "ITEM-001",
  name: "測試品項",
  description: "說明",
  specification: "規格",
  baseUnit: "PCS",
  barcode: "471000000001",
  itemType: "PRODUCT" as const,
  salesEnabled: true,
  purchaseEnabled: false,
  inventoryEnabled: false,
  productionEnabled: false,
  status: "ACTIVE" as const,
  companyRelations: [{
    id: "relation-a",
    companyId: "company-a",
    companyItemCode: "A-001",
    salesEnabled: true,
    status: "ACTIVE" as const,
    company: { code: "A", name: "甲公司" },
  }],
};

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "test-idempotency-key" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("P4.4b Items DOM interaction", () => {
  it("connects labels and exposes native required validation", () => {
    render(<ItemCreateClient selectedCompanyId="company-a" />);

    for (const label of [/公司品項代碼/, /全系統品項代碼/, /品項名稱/, /基本單位/]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.required).toBe(true);
      expect(input.getAttribute("aria-required")).toBe("true");
      expect(input.checkValidity()).toBe(false);
    }
  });

  it("preserves create endpoint, payload flags, pending state and error alert", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ItemCreateClient selectedCompanyId="company-a" />);

    fireEvent.change(screen.getByLabelText(/公司品項代碼/), { target: { value: "A-001" } });
    fireEvent.change(screen.getByLabelText(/全系統品項代碼/), { target: { value: "ITEM-001" } });
    fireEvent.change(screen.getByLabelText(/品項名稱/), { target: { value: "測試品項" } });
    fireEvent.change(screen.getByLabelText(/基本單位/), { target: { value: "PCS" } });
    const submit = screen.getByRole("button", { name: "建立品項" });
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/items");
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toMatchObject({
      companyId: "company-a",
      item: {
        code: "ITEM-001",
        name: "測試品項",
        purchaseEnabled: false,
        inventoryEnabled: false,
        productionEnabled: false,
      },
      companyRelation: { companyItemCode: "A-001", status: "ACTIVE" },
    });

    resolveRequest(failedResponse("品項代碼重複"));
    expect((await screen.findByRole("alert")).textContent).toContain("品項代碼重複");
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  });

  it("recovers item create and edit after rejected fetches", async () => {
    let rejectRequest!: (reason: Error) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ItemCreateClient selectedCompanyId="company-a" />);
    const create = screen.getByRole("button", { name: "建立品項" });
    fireEvent.submit(create.closest("form")!);
    await waitFor(() => expect(create.getAttribute("aria-busy")).toBe("true"));
    rejectRequest(new Error("網路連線失敗"));
    expect((await screen.findByRole("alert")).textContent).toContain("網路連線失敗");
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
    expect(create.getAttribute("aria-busy")).toBeNull();

    cleanup();
    render(
      <ItemManagerClient
        item={managedItem}
        companies={[{ id: "company-a", code: "A", name: "甲公司" }]}
        selectedCompanyId="company-a"
      />,
    );
    const edit = screen.getByRole("button", { name: "儲存品項" });
    fireEvent.submit(edit.closest("form")!);
    await waitFor(() => expect(edit.getAttribute("aria-busy")).toBe("true"));
    rejectRequest(new Error("網路連線失敗"));
    expect((await screen.findByRole("alert")).textContent).toContain("網路連線失敗");
    await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false));
    expect(edit.getAttribute("aria-busy")).toBeNull();
  });

  it("preserves item PATCH payload and company relation POST target", async () => {
    const fetchMock = vi.fn().mockResolvedValue(failedResponse("測試錯誤"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ItemManagerClient
        item={managedItem}
        companies={[{ id: "company-a", code: "A", name: "甲公司" }]}
        selectedCompanyId="company-a"
      />,
    );

    const saveItem = screen.getByRole("button", { name: "儲存品項" });
    fireEvent.submit(saveItem.closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    let [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items/item-a");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(String(options.body))).toMatchObject({
      companyId: "company-a",
      item: {
        code: "ITEM-001",
        purchaseEnabled: false,
        inventoryEnabled: false,
        productionEnabled: false,
        status: "ACTIVE",
      },
    });
    await screen.findByRole("alert");

    fetchMock.mockClear();
    const saveRelation = screen.getByRole("button", { name: "更新關係" });
    fireEvent.submit(saveRelation.closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items/item-a/companies");
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({
      companyId: "company-a",
      relation: { companyItemCode: "A-001", salesEnabled: true, status: "ACTIVE" },
    });
  });
});
