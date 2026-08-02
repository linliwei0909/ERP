// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanySettingsClient } from "../../src/app/(authenticated)/admin/company-settings/company-settings-client";
import { FreightRuleCreateClient } from "../../src/app/(authenticated)/admin/freight-rules/freight-rule-create-client";
import { FreightRuleEditor } from "../../src/app/(authenticated)/admin/freight-rules/[id]/freight-rule-editor";
import { MasterImportClient } from "../../src/app/(authenticated)/admin/master-import/master-import-client";
import { UserActionButton } from "../../src/app/(authenticated)/admin/users/user-action-button";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterAll(() => {
  if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal; else delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  if (originalClose) HTMLDialogElement.prototype.close = originalClose; else delete (HTMLDialogElement.prototype as { close?: unknown }).close;
});

beforeEach(() => vi.stubGlobal("crypto", { randomUUID: () => "test-idempotency-key" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("P4.4d Admin DOM interaction", () => {
  it("confirms cancellation through shared dialog and preserves cancel endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "取消失敗測試" } }) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanySettingsClient companies={[{ id: "company-a", code: "A", name: "甲公司" }]} selectedCompanyId="company-a" selectedSettingKey="billing_cutoff_day" history={[{ id: "setting-a", settingKey: "billing_cutoff_day", settingValue: 25, effectiveFrom: "2099-01-01", state: "FUTURE", createdAt: "2026-08-02", updatedAt: "2026-08-02", cancelledAt: null }]} />);
    fireEvent.click(screen.getByRole("button", { name: "取消版本" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const dialogButtons = screen.getAllByRole("button", { name: "取消版本" });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/company-settings/setting-a/cancel");
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({ companyId: "company-a", settingKey: "billing_cutoff_day" });
    expect((await screen.findByRole("alert")).textContent).toContain("取消失敗測試");
  });

  it("submits the unchanged native user form only after confirmation", () => {
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(<form action="/api/admin/users/user-a/sessions/revoke" method="post" onSubmit={submit}><input type="hidden" name="reason" value="管理員撤銷全部 Session" /><UserActionButton label="撤銷全部 Session" title="撤銷全部 Session" description="確定撤銷？" destructive /></form>);
    fireEvent.click(screen.getByRole("button", { name: "撤銷全部 Session" }));
    expect(submit).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole("button", { name: "撤銷全部 Session" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("closes the formal import dialog on failure and exposes a retryable alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "正式匯入失敗測試" } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<MasterImportClient companyId="company-a" />);

    const trigger = screen.getByRole("button", { name: "確認正式匯入" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "執行正式匯入" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "正式匯入失敗測試",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("recovers freight create and edit actions after rejected fetches", async () => {
    let rejectRequest!: (reason: Error) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FreightRuleCreateClient
        companyId="company-a"
        locations={[{ id: "location-a", customerId: "customer-a", label: "客戶／地點" }]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/客戶與送貨地點/), {
      target: { value: "location-a" },
    });
    const create = screen.getByRole("button", { name: "新增規則" });
    fireEvent.submit(create.closest("form")!);
    await waitFor(() => expect(create.getAttribute("aria-busy")).toBe("true"));
    rejectRequest(new Error("網路連線失敗"));
    expect((await screen.findByRole("alert")).textContent).toContain("網路連線失敗");
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
    expect(create.getAttribute("aria-busy")).toBeNull();

    cleanup();
    render(
      <FreightRuleEditor
        companyId="company-a"
        value={{
          id: "freight-a",
          customerId: "customer-a",
          deliveryLocationId: "location-a",
          mode: "NO_CHARGE",
          unitFreight: null,
          fixedFreight: null,
          validFrom: "2026-08-01",
          validTo: null,
          status: "ACTIVE",
        }}
      />,
    );
    const edit = screen.getByRole("button", { name: "儲存規則" });
    fireEvent.submit(edit.closest("form")!);
    await waitFor(() => expect(edit.getAttribute("aria-busy")).toBe("true"));
    rejectRequest(new Error("網路連線失敗"));
    expect((await screen.findByRole("alert")).textContent).toContain("網路連線失敗");
    await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false));
    expect(edit.getAttribute("aria-busy")).toBeNull();
  });
});
