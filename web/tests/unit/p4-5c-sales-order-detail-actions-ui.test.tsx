// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
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
import { LinkButton } from "../../src/components/ui";
import { PageHeader } from "../../src/components/app-shell/page-header";
import type { DeliveryNoteSummaryDto } from "../../src/lib/delivery-notes/api-types";
import {
  SalesOrderDetailView,
  type SalesOrderDetailOrder,
} from "../../src/app/(authenticated)/sales-orders/sales-order-detail-view";
import {
  canStartSalesOrderRevision,
  canVoidSalesOrder,
  SalesOrderStatusActions,
} from "../../src/app/(authenticated)/sales-orders/sales-order-status-actions";
import { DeliveryNoteOrderActions } from "../../src/app/(authenticated)/sales-orders/delivery-note-order-actions";
import { SalesOrderEditor } from "../../src/app/(authenticated)/sales-orders/sales-order-editor";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
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

const ids = {
  order: "10000000-0000-4000-8000-000000000041",
  note: "10000000-0000-4000-8000-000000000061",
  note2: "10000000-0000-4000-8000-000000000062",
};

function okResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function failedResponse(message: string) {
  return {
    ok: false,
    json: async () => ({ error: { message } }),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "test-idempotency-key" });
  pushMock.mockClear();
  refreshMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("P4.5c SalesOrderStatusActions visibility matrix", () => {
  it.each([
    ["DRAFT", true, false, true],
    ["CONFIRMED", false, true, true],
    ["DELIVERY_CREATED", false, true, true],
    ["SHIPPED", false, false, false],
    ["COMPLETED", false, false, false],
    ["VOIDED", false, false, false],
  ] as const)(
    "status %s shows confirm=%s revision=%s void=%s",
    (status, confirm, revision, voidAction) => {
      render(
        <SalesOrderStatusActions
          orderId={ids.order}
          status={status}
          canManage
        />,
      );
      expect(!!screen.queryByRole("button", { name: "確認訂單" })).toBe(
        confirm,
      );
      expect(!!screen.queryByRole("button", { name: "開始修訂" })).toBe(
        revision,
      );
      expect(!!screen.queryByRole("button", { name: "作廢訂單" })).toBe(
        voidAction,
      );
    },
  );

  it("renders nothing when canManage is false, regardless of status", () => {
    const { container } = render(
      <SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("exposes unchanged draft-only status predicates", () => {
    expect(canStartSalesOrderRevision("CONFIRMED")).toBe(true);
    expect(canVoidSalesOrder("SHIPPED")).toBe(false);
  });
});

describe("P4.5c SalesOrderStatusActions: confirm", () => {
  it("opens a ConfirmDialog with explanatory text, and Cancel closes without a request", async () => {
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog", { name: "確認訂單" });
    expect(within(dialog).getByText(/確認後無法直接編輯/)).toBeTruthy();
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes on Escape without sending a request", async () => {
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog");
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POSTs the exact endpoint/body with an idempotency header, shows pending, and refreshes on success", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: "確認訂單",
    });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect((confirmButton as HTMLButtonElement).disabled).toBe(true),
    );
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`/api/sales-orders/${ids.order}/confirm`);
    expect(init.method).toBe("POST");
    expect(init.headers["idempotency-key"]).toBe("test-idempotency-key");
    expect(JSON.parse(init.body)).toEqual({});

    resolveRequest(okResponse({ id: ids.order }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows the server error message on HTTP failure and allows a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failedResponse("訂單至少需要一筆有效明細")),
    );
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "確認訂單" }));
    expect(
      await within(dialog).findByText("訂單至少需要一筆有效明細"),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("recovers from a rejected fetch with a generic message (now caught, not an unhandled rejection)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "確認訂單" }));
    expect(
      await within(dialog).findByText("網路連線異常，請稍後再試一次"),
    ).toBeTruthy();
  });

  it("recovers from a JSON parse failure with a generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      })) as unknown as typeof fetch,
    );
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "確認訂單" }));
    expect(
      await within(dialog).findByText("伺服器回應格式異常，請稍後再試一次"),
    ).toBeTruthy();
  });

  it("blocks a duplicate submit while a confirm request is in flight", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    const dialog = await screen.findByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: "確認訂單",
    }) as HTMLButtonElement;
    fireEvent.click(confirmButton);
    confirmButton.disabled = false;
    fireEvent.click(confirmButton);
    resolveRequest(okResponse({ id: ids.order }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("P4.5c SalesOrderStatusActions: revision", () => {
  it("only shows for CONFIRMED/DELIVERY_CREATED and posts to the revision endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ id: ids.order })));
    render(
      <SalesOrderStatusActions
        orderId={ids.order}
        status="DELIVERY_CREATED"
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "開始修訂" }));
    const dialog = await screen.findByRole("dialog", { name: "開始修訂" });
    expect(within(dialog).getByText(/修訂版次/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "開始修訂" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`/api/sales-orders/${ids.order}/revision`);
    expect(JSON.parse(init.body)).toEqual({});
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("recovers from an HTTP error and permits retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failedResponse("目前銷貨單狀態或版次不允許開始修訂"))
      .mockResolvedValueOnce(okResponse({ id: ids.order }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SalesOrderStatusActions orderId={ids.order} status="CONFIRMED" canManage />,
    );
    fireEvent.click(screen.getByRole("button", { name: "開始修訂" }));
    const dialog = await screen.findByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: "開始修訂",
    });
    fireEvent.click(confirmButton);
    await within(dialog).findByText("目前銷貨單狀態或版次不允許開始修訂");
    fireEvent.click(confirmButton);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("P4.5c SalesOrderStatusActions: void", () => {
  it("requires a non-blank reason and never calls window.prompt", async () => {
    const promptSpy = vi.spyOn(window, "prompt");
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "作廢訂單" }));
    const dialog = await screen.findByRole("dialog", { name: "作廢訂單" });
    expect(within(dialog).getByText(/無法復原/)).toBeTruthy();
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
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("sends the exact trimmed payload and uses the destructive Button presentation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ id: ids.order })));
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    const trigger = screen.getByRole("button", { name: "作廢訂單" });
    expect(trigger.className).toMatch(/destructive/);
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "  客戶取消訂單  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認作廢" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`/api/sales-orders/${ids.order}/void`);
    expect(JSON.parse(init.body)).toEqual({ reason: "客戶取消訂單" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("cancel does not submit and the dialog resets", async () => {
    render(<SalesOrderStatusActions orderId={ids.order} status="DRAFT" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "作廢訂單" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/作廢原因/), {
      target: { value: "測試" },
    });
    vi.stubGlobal("fetch", vi.fn());
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("P4.5c SalesOrderDetailView", () => {
  function order(
    overrides: Partial<SalesOrderDetailOrder> = {},
  ): SalesOrderDetailOrder {
    return {
      orderNumber: "SO-IN-202607-000001",
      orderDate: "2026-07-27",
      status: "CONFIRMED",
      revisionNo: 1,
      subtotal: "1000",
      freightAmount: "50",
      totalAmount: "1050",
      lines: [
        {
          id: "line-1",
          quantity: "2.0000",
          unitPrice: "500.00000",
          manualPriceReason: "",
          itemSnapshot: { companyItemCode: "ITEM-X", name: "品項X" },
        },
      ],
      snapshots: {
        customer: { name: "測試客戶A" },
        delivery: { name: "台北倉", fullAddress: "台北市測試路 1 號" },
        contact: { name: "王小明" },
      },
      ...overrides,
    };
  }

  it.each([
    ["DRAFT", "草稿"],
    ["CONFIRMED", "已確認"],
    ["DELIVERY_CREATED", "已建立銷貨單"],
    ["SHIPPED", "已出貨"],
    ["COMPLETED", "已完成"],
    ["VOIDED", "作廢"],
  ] as const)("maps status %s to Chinese label %s", (status, label) => {
    render(<SalesOrderDetailView order={order({ status })} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(status)).toBeNull();
  });

  it("renders order metadata, customer/delivery/contact, line items and totals", () => {
    render(<SalesOrderDetailView order={order()} />);
    expect(screen.getByText("SO-IN-202607-000001")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2026-07-27")).toBeTruthy();
    expect(screen.getByText("測試客戶A")).toBeTruthy();
    expect(screen.getByText("台北倉")).toBeTruthy();
    expect(screen.getByText("台北市測試路 1 號")).toBeTruthy();
    expect(screen.getByText("王小明")).toBeTruthy();
    expect(screen.getByText("ITEM-X－品項X")).toBeTruthy();
    expect(screen.getByText("2.0000")).toBeTruthy();
    expect(screen.getByText("500.00000")).toBeTruthy();
    expect(screen.getByText("NT$ 1000")).toBeTruthy();
    expect(screen.getByText("NT$ 50")).toBeTruthy();
    expect(screen.getByText("NT$ 1050")).toBeTruthy();
  });

  it("never renders the raw JSON snapshot", () => {
    render(<SalesOrderDetailView order={order()} />);
    expect(screen.queryByText("快照與來源資訊（唯讀）")).toBeNull();
    expect(screen.queryByText(/"companyItemCode":/)).toBeNull();
  });

  it("exposes an accessible read-only table with caption and column headers", () => {
    render(<SalesOrderDetailView order={order()} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("訂單明細（唯讀）")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });
});

describe("P4.5c page composition (mirrors [id]/page.tsx)", () => {
  function renderRoute(child: React.ReactNode) {
    return renderToStaticMarkup(
      <main data-testid="route-main">
        <PageHeader
          containerVariant="wide"
          context="P3.1 銷售流程"
          title="銷售訂單明細"
          actions={
            <LinkButton href="/sales-orders" variant="secondary">
              返回清單
            </LinkButton>
          }
        />
        {child}
      </main>,
    );
  }

  it("keeps a single h1 and single top-level main when showing the DRAFT editor", () => {
    const html = renderRoute(
      <SalesOrderEditor
        customers={[]}
        items={[]}
        initial={{
          id: ids.order,
          orderNumber: "SO-IN-202607-000001",
          orderDate: "2026-07-27",
          customerId: "",
          deliveryLocationId: "",
          customerContactId: null,
          paymentTermsText: null,
          status: "DRAFT",
          revisionNo: 1,
          subtotal: "0",
          freightAmount: "0",
          totalAmount: "0",
          lines: [],
          snapshots: {},
        }}
        canManage
      />,
    );
    expect(html.match(/<main/g)?.length).toBe(1);
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("返回清單");
  });

  it("keeps a single h1 and single top-level main when showing the read-only detail view", () => {
    const html = renderRoute(
      <SalesOrderDetailView
        order={{
          orderNumber: "SO-IN-202607-000001",
          orderDate: "2026-07-27",
          status: "CONFIRMED",
          revisionNo: 1,
          subtotal: "0",
          freightAmount: "0",
          totalAmount: "0",
          lines: [],
          snapshots: {},
        }}
      />,
    );
    expect(html.match(/<main/g)?.length).toBe(1);
    expect(html.match(/<h1/g)?.length).toBe(1);
  });
});

describe("P4.5c DeliveryNoteOrderActions", () => {
  function note(overrides: Partial<DeliveryNoteSummaryDto> = {}): DeliveryNoteSummaryDto {
    return {
      id: ids.note,
      companyId: "company-a",
      deliveryNoteNumber: "DN-IN-202607-000001",
      deliveryNoteDate: "2026-07-27",
      fiscalYear: 2026,
      fiscalMonth: 7,
      salesOrderId: ids.order,
      salesOrderNumber: "SO-IN-202607-000001",
      salesOrderRevisionNo: 1,
      status: "ACTIVE",
      customer: { name: "測試客戶" },
      subtotal: "100",
      freightAmount: "20",
      totalAmount: "120",
      voidSource: null,
      voidedAt: null,
      voidReason: null,
      createdAt: "2026-07-27T03:00:00.000Z",
      ...overrides,
    };
  }

  it("shows create when CONFIRMED, canManage and no current note", () => {
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={1}
        notes={[]}
        canManage
      />,
    );
    expect(screen.getByRole("button", { name: "建立銷貨單" })).toBeTruthy();
    expect(screen.getByText("目前尚無銷貨單。")).toBeTruthy();
  });

  it("shows rebuild when the current note's revision trails the order", () => {
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={2}
        notes={[note({ salesOrderRevisionNo: 1 })]}
        canManage
      />,
    );
    expect(screen.getByRole("button", { name: "重建銷貨單" })).toBeTruthy();
  });

  it("hides the action and shows a read-only notice when canManage is false", () => {
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={1}
        notes={[]}
        canManage={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "建立銷貨單" })).toBeNull();
    expect(
      screen.getByText("目前帳號只有檢視權限，無法建立或重建銷貨單。"),
    ).toBeTruthy();
  });

  it("shows the current delivery note link and history, without any void/print controls", () => {
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="DELIVERY_CREATED"
        revisionNo={1}
        notes={[note(), note({ id: ids.note2, status: "VOIDED", deliveryNoteNumber: "DN-IN-202607-000000" })]}
        canManage
      />,
    );
    expect(
      screen.getByRole("link", { name: "查看目前銷貨單" }).getAttribute("href"),
    ).toBe(`/delivery-notes/${ids.note}`);
    expect(screen.getByText(/DN-IN-202607-000001－有效/)).toBeTruthy();
    expect(screen.getByText(/DN-IN-202607-000000－已作廢/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /作廢/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /列印/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /補印/ })).toBeNull();
  });

  it("create: opens a confirmation dialog without a reason field and posts the expected payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ deliveryNote: { id: ids.note } })),
    );
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={3}
        notes={[]}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "建立銷貨單" }));
    const dialog = await screen.findByRole("dialog", { name: "確認建立銷貨單" });
    expect(within(dialog).queryByLabelText(/原因/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "建立銷貨單" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`/api/sales-orders/${ids.order}/delivery-note`);
    expect(init.headers["idempotency-key"]).toBe("test-idempotency-key");
    expect(JSON.parse(init.body)).toEqual({ expectedRevisionNo: 3 });
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`/delivery-notes/${ids.note}`),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("rebuild: requires a reason, sends the trimmed reason, and shows a Textarea labelled 重建原因", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ deliveryNote: { id: ids.note2 } })),
    );
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={2}
        notes={[note({ salesOrderRevisionNo: 1 })]}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "重建銷貨單" }));
    const dialog = await screen.findByRole("dialog", { name: "確認重建銷貨單" });
    const submit = within(dialog).getByRole("button", { name: "重建銷貨單" });
    fireEvent.click(submit);
    expect(await within(dialog).findByText("重建理由必填")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/重建原因/), {
      target: { value: "  訂單修訂後重建  " },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`/api/sales-orders/${ids.order}/delivery-note/rebuild`);
    expect(JSON.parse(init.body)).toEqual({
      expectedRevisionNo: 2,
      reason: "訂單修訂後重建",
    });
  });

  it("blocks a duplicate submit while create is in flight (busy ref)", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={1}
        notes={[]}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "建立銷貨單" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", {
      name: "建立銷貨單",
    }) as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    submit.disabled = false;
    fireEvent.click(submit);
    resolveRequest(okResponse({ deliveryNote: { id: ids.note } }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows a typed client error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        failedResponse("訂單已有有效銷貨單"),
      ),
    );
    render(
      <DeliveryNoteOrderActions
        salesOrderId={ids.order}
        orderStatus="CONFIRMED"
        revisionNo={1}
        notes={[]}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "建立銷貨單" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "建立銷貨單" }));
    expect(await within(dialog).findByText("訂單已有有效銷貨單")).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
