// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  DeliveryNotePrintActions,
  DeliveryNoteVoidAction,
} from "../../src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions";
import type { DeliveryNotePrintCapabilities } from "../../src/lib/delivery-notes/types";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterAll(() => {
  if (originalShowModal) {
    HTMLDialogElement.prototype.showModal = originalShowModal;
  } else {
    delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  }
  if (originalClose) {
    HTMLDialogElement.prototype.close = originalClose;
  } else {
    delete (HTMLDialogElement.prototype as { close?: unknown }).close;
  }
});

const ids = { note: "10000000-0000-4000-8000-000000000071" };

const capabilities = (
  overrides: Partial<DeliveryNotePrintCapabilities> = {},
): DeliveryNotePrintCapabilities => ({
  canFormalPrint: false,
  canReprint: false,
  canDownload: false,
  ...overrides,
});

function printResponse() {
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      deliveryNote: { id: ids.note, status: "SHIPPED", reprintCount: 0 },
      salesOrder: { id: "order" },
      printVersion: { documentVersion: 1 },
      printEvent: { type: "FORMAL_PRINT" },
      downloadUrl: `/api/delivery-notes/${ids.note}/pdf`,
      replayed: false,
      correlationId: "corr-1",
    }),
  } as unknown as Response;
}

function failedResponse(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ error: { code, message }, correlationId: "corr-err" }),
  } as unknown as Response;
}

function pdfDownloadFailure() {
  return {
    ok: false,
    status: 404,
    headers: { get: () => null },
    json: async () => ({
      error: { code: "NOT_FOUND", message: "找不到 PDF" },
    }),
  } as unknown as Response;
}

function fetchRouter(handlers: {
  print?: (init: RequestInit) => Response;
  pdf?: () => Response;
}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/pdf")) {
      return (handlers.pdf ?? pdfDownloadFailure)();
    }
    if (handlers.print) return handlers.print(init as RequestInit);
    return printResponse();
  });
}

beforeEach(() => {
  refreshMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("P4.6c1 DeliveryNotePrintActions dialog shell", () => {
  it("shows only the buttons allowed by capabilities", () => {
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    expect(screen.getByRole("button", { name: "正式列印" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "補印" })).toBeNull();
    expect(screen.queryByRole("button", { name: "下載 PDF" })).toBeNull();
  });

  it("opens an accessible ConfirmDialog with the exact formal-print confirmation copy", async () => {
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "正式列印" }));
    const dialog = await screen.findByRole("dialog", { name: "確認正式列印" });
    expect(
      within(dialog).getByText(
        "此操作會將銷貨單與來源訂單標記為已出貨、寫入實際出貨日，並建立不可變的正式 PDF。",
      ),
    ).toBeTruthy();
  });

  it("Cancel closes the dialog, returns focus to the trigger, and never calls fetch", async () => {
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    const trigger = screen.getByRole("button", { name: "正式列印" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Escape closes the formal-print dialog without sending a request", async () => {
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "正式列印" }));
    const dialog = await screen.findByRole("dialog");
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits the formal-print operation key, disables while pending, and refreshes on success", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/pdf")) return pdfDownloadFailure();
      return new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "正式列印" }));
    const dialog = await screen.findByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", { name: "確認" });
    fireEvent.click(confirmButton);
    await waitFor(() => expect((confirmButton as HTMLButtonElement).disabled).toBe(true));
    expect(dialog.getAttribute("aria-busy")).toBe("true");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/delivery-notes/${ids.note}/formal-print`);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe("{}");
    expect((init as RequestInit).headers).toMatchObject({
      "idempotency-key": expect.any(String),
    });

    resolveRequest(printResponse());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and shows the server error inside it on failure (retry boundary)", async () => {
    const fetchMock = fetchRouter({
      print: () => failedResponse(422, "DELIVERY_NOTE_SNAPSHOT_INVALID", "快照資料不合法"),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "正式列印" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    expect(await within(dialog).findByText("快照資料不合法")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("reuses the same idempotency key on a same-operation retry after a network error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network timeout"))
      .mockResolvedValueOnce(printResponse())
      .mockResolvedValueOnce(pdfDownloadFailure());
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "正式列印" }));
    const dialog = await screen.findByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", { name: "確認" });
    fireEvent.click(confirmButton);
    await within(dialog).findByText("列印操作未確認完成；請使用相同操作重試");
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));

    const firstKey = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    const retryKey = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(firstKey["idempotency-key"]).toBe(retryKey["idempotency-key"]);
  });

  it("blocks a duplicate submit while a formal-print request is in flight", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = fetchRouter({
      print: () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }) as unknown as Response,
      pdf: pdfDownloadFailure,
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canFormalPrint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "正式列印" }));
    const dialog = await screen.findByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: "確認",
    }) as HTMLButtonElement;
    fireEvent.click(confirmButton);
    confirmButton.disabled = false;
    fireEvent.click(confirmButton);
    resolveRequest(printResponse());
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    const printCalls = fetchMock.mock.calls.filter(([url]) =>
      (url as string).endsWith("/formal-print"),
    );
    expect(printCalls).toHaveLength(1);
  });

  it("shows reprint (not formal-print) copy and posts to the reprint endpoint", async () => {
    const fetchMock = fetchRouter({});
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canReprint: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "補印" }));
    const dialog = await screen.findByRole("dialog", { name: "確認補印" });
    expect(
      within(dialog).getByText(
        "此操作會新增一筆補印紀錄並增加補印次數，正式 PDF 內容不會重新產生。",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/delivery-notes/${ids.note}/reprint`,
    );
  });

  it("download button calls the pdf endpoint directly, independent of the print dialog", async () => {
    const fetchMock = fetchRouter({});
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeliveryNotePrintActions
        deliveryNoteId={ids.note}
        capabilities={capabilities({ canDownload: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "下載 PDF" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/delivery-notes/${ids.note}/pdf`);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("P4.6c1 DeliveryNoteVoidAction dialog shell", () => {
  it("shows the destructive trigger and an accessible confirm dialog with a required reason field", async () => {
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    const trigger = screen.getByRole("button", { name: "管理員作廢" });
    expect(trigger.className).toMatch(/destructive/);
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "確認作廢銷貨單" });
    expect(within(dialog).getByText(/不會刪除交易資料/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/作廢原因/)).toBeTruthy();
  });

  it("requires a non-blank reason before calling fetch (client validation, not a new idempotency contract)", async () => {
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    const dialog = await screen.findByRole("dialog");
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.click(within(dialog).getByRole("button", { name: "確認作廢" }));
    expect(await within(dialog).findByText("作廢理由必填")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "   " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認作廢" }));
    expect(await within(dialog).findByText("作廢理由必填")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the exact trimmed payload to the unchanged void endpoint and refreshes on success", async () => {
    const fetchMock = vi.fn(async () => printResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "  資料錯誤  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認作廢" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/delivery-notes/${ids.note}/void`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      reason: "資料錯誤",
    });
    expect((init as RequestInit).headers).toMatchObject({
      "idempotency-key": expect.any(String),
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("銷貨單已作廢")).toBeTruthy();
  });

  it("keeps the dialog open and shows the server error on failure, permitting a retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        failedResponse(409, "DELIVERY_NOTE_ADMIN_VOID_NOT_ALLOWED", "目前狀態不可由管理員直接作廢銷貨單"),
      )
      .mockResolvedValueOnce(printResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "資料錯誤" },
    });
    const confirm = within(dialog).getByRole("button", { name: "確認作廢" });
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByText("目前狀態不可由管理員直接作廢銷貨單"),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();

    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears a stale server error once a subsequent submit is rejected by local validation", async () => {
    const fetchMock = vi.fn(async () =>
      failedResponse(
        409,
        "DELIVERY_NOTE_ADMIN_VOID_NOT_ALLOWED",
        "目前狀態不可由管理員直接作廢銷貨單",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    const dialog = await screen.findByRole("dialog");
    const reasonField = within(dialog).getByLabelText(/作廢原因/);
    const confirm = within(dialog).getByRole("button", { name: "確認作廢" });

    fireEvent.change(reasonField, { target: { value: "資料錯誤" } });
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByText("目前狀態不可由管理員直接作廢銷貨單"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(reasonField, { target: { value: "   " } });
    fireEvent.click(confirm);

    expect(await within(dialog).findByText("作廢理由必填")).toBeTruthy();
    expect(
      within(dialog).queryByText("目前狀態不可由管理員直接作廢銷貨單"),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Cancel closes without submitting and preserves the typed reason (existing behaviour, unchanged)", async () => {
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "草稿理由" },
    });
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/作廢原因/) as HTMLTextAreaElement).value,
    ).toBe("草稿理由");
  });

  it("blocks a duplicate submit while a void request is in flight", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<DeliveryNoteVoidAction deliveryNoteId={ids.note} />);
    fireEvent.click(screen.getByRole("button", { name: "管理員作廢" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "資料錯誤" },
    });
    const confirm = within(dialog).getByRole("button", {
      name: "確認作廢",
    }) as HTMLButtonElement;
    fireEvent.click(confirm);
    confirm.disabled = false;
    fireEvent.click(confirm);
    resolveRequest(printResponse());
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
