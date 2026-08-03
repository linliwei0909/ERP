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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkButton } from "../../src/components/ui";
import { PageHeader } from "../../src/components/app-shell/page-header";
import {
  filterItemOptions,
  formatItemOptionLabel,
} from "../../src/app/(authenticated)/sales-orders/item-combobox";
import {
  canStartSalesOrderRevision,
  canVoidSalesOrder,
  SalesOrderEditor,
} from "../../src/app/(authenticated)/sales-orders/sales-order-editor";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const ids = {
  customerA: "10000000-0000-4000-8000-000000000001",
  customerB: "10000000-0000-4000-8000-000000000002",
  locationA1: "10000000-0000-4000-8000-000000000011",
  locationA2: "10000000-0000-4000-8000-000000000012",
  locationB1: "10000000-0000-4000-8000-000000000013",
  contactA1: "10000000-0000-4000-8000-000000000021",
  itemX: "10000000-0000-4000-8000-000000000031",
  itemY: "10000000-0000-4000-8000-000000000032",
  order: "10000000-0000-4000-8000-000000000041",
  line1: "10000000-0000-4000-8000-000000000051",
};

const customers = [
  {
    id: ids.customerA,
    code: "C001",
    name: "測試客戶A",
    contacts: [{ id: ids.contactA1, name: "王小明" }],
    locations: [
      { id: ids.locationA1, code: "L1", name: "台北倉" },
      { id: ids.locationA2, code: "L2", name: "新竹倉" },
    ],
  },
  {
    id: ids.customerB,
    code: "C002",
    name: "測試客戶B",
    contacts: [],
    locations: [{ id: ids.locationB1, code: "L3", name: "台中倉" }],
  },
];

const items = [
  { id: ids.itemX, code: "ITEM-X", name: "品項X", baseUnit: "PCS" },
  { id: ids.itemY, code: "ITEM-Y", name: "品項Y", baseUnit: "KG" },
];

const initialDraft = {
  id: ids.order,
  orderNumber: "SO-IN-202607-000001",
  orderDate: "2026-07-27",
  customerId: ids.customerA,
  deliveryLocationId: ids.locationA1,
  customerContactId: ids.contactA1,
  paymentTermsText: "月結 30 天",
  status: "DRAFT",
  revisionNo: 1,
  subtotal: "1000",
  freightAmount: "50",
  totalAmount: "1050",
  lines: [
    {
      id: ids.line1,
      itemId: ids.itemX,
      quantity: "2",
      unitPrice: "500",
      manualPriceReason: "",
    },
  ],
  snapshots: { customer: { name: "測試客戶A" } },
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
});

describe("P4.5b shared create/edit contract", () => {
  it("renders create mode with a default line and no status-action bar", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    expect(
      screen.getByText("訂單號由系統在草稿建立成功時產生。"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "建立草稿" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "確認訂單" })).toBeNull();
    expect(screen.queryByRole("button", { name: "開始修訂" })).toBeNull();
    expect(screen.queryByRole("button", { name: "作廢訂單" })).toBeNull();
    expect(
      (screen.getByRole("combobox", { name: "品項" }) as HTMLInputElement)
        .value,
    ).toBe("ITEM-X－品項X");
  });

  it("renders DRAFT edit mode with existing values bound and fields editable", () => {
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    expect(screen.getByText("SO-IN-202607-000001")).toBeTruthy();
    expect(
      (screen.getByLabelText("訂單日期") as HTMLInputElement).value,
    ).toBe("2026-07-27");
    expect((screen.getByLabelText("客戶") as HTMLSelectElement).value).toBe(
      ids.customerA,
    );
    expect(
      (screen.getByLabelText("送貨地點") as HTMLSelectElement).value,
    ).toBe(ids.locationA1);
    expect(
      (screen.getByLabelText("聯絡人（可不選）") as HTMLSelectElement).value,
    ).toBe(ids.contactA1);
    expect(
      (screen.getByLabelText("數量") as HTMLInputElement).value,
    ).toBe("2");
    expect(
      (screen.getByLabelText("未稅成交單價") as HTMLInputElement).value,
    ).toBe("500");
    expect((screen.getByLabelText("客戶") as HTMLSelectElement).disabled).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: "儲存草稿" })).toBeTruthy();
  });

  it("disables all editable controls and hides save/add/remove for a non-DRAFT order", () => {
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={{ ...initialDraft, status: "CONFIRMED" }}
      />,
    );
    expect((screen.getByLabelText("客戶") as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByLabelText("數量") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("combobox", { name: "品項" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "儲存草稿" })).toBeNull();
    expect(screen.queryByRole("button", { name: "新增明細" })).toBeNull();
    expect(screen.queryByRole("button", { name: /移除第/ })).toBeNull();
    expect(screen.getByText("CONFIRMED")).toBeTruthy();
  });
});

describe("P4.5b customer/location/contact behavior", () => {
  it("resets delivery location to the new customer's first location on customer change", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    fireEvent.change(screen.getByLabelText("客戶"), {
      target: { value: ids.customerB },
    });
    expect(
      (screen.getByLabelText("送貨地點") as HTMLSelectElement).value,
    ).toBe(ids.locationB1);
  });

  it("clears the selected contact on customer change", () => {
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    expect(
      (screen.getByLabelText("聯絡人（可不選）") as HTMLSelectElement).value,
    ).toBe(ids.contactA1);
    fireEvent.change(screen.getByLabelText("客戶"), {
      target: { value: ids.customerB },
    });
    expect(
      (screen.getByLabelText("聯絡人（可不選）") as HTMLSelectElement).value,
    ).toBe("");
  });
});

describe("P4.5b searchable item combobox", () => {
  it("filters options as the user types", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    const combobox = screen.getByRole("combobox", { name: "品項" });
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "Y" } });
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("品項Y")).toBeTruthy();
    expect(within(listbox).queryByText("品項X")).toBeNull();
  });

  it("supports keyboard selection with ArrowDown and Enter", async () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    const combobox = screen.getByRole("combobox", {
      name: "品項",
    }) as HTMLInputElement;
    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.keyDown(combobox, { key: "Enter" });
    await waitFor(() => expect(combobox.value).toBe("ITEM-Y－品項Y"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape and reverts to the last real selection", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    const combobox = screen.getByRole("combobox", {
      name: "品項",
    }) as HTMLInputElement;
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "不存在的品項文字" } });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox.value).toBe("ITEM-X－品項X");
  });

  it("never commits free-typed text as the payload itemId — only an explicit selection counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse({ id: "10000000-0000-4000-8000-000000000099" }),
      ),
    );
    render(<SalesOrderEditor customers={customers} items={items} />);
    const combobox = screen.getByRole("combobox", { name: "品項" });
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "不是任何品項的亂打文字" } });
    fireEvent.blur(combobox);

    fireEvent.click(screen.getByRole("button", { name: "建立草稿" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.draft.lines[0].itemId).toBe(ids.itemX);
  });

  it("does not clear an existing manual unit price when the item selection changes", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    fireEvent.change(screen.getByLabelText("未稅成交單價"), {
      target: { value: "888" },
    });
    const combobox = screen.getByRole("combobox", { name: "品項" });
    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(
      (screen.getByLabelText("未稅成交單價") as HTMLInputElement).value,
    ).toBe("888");
  });
});

describe("P4.5b line items", () => {
  it("adds a line with default values and preserves order", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "新增明細" }));
    const quantities = screen.getAllByLabelText("數量") as HTMLInputElement[];
    expect(quantities).toHaveLength(2);
    expect(quantities[1].value).toBe("1");
  });

  it("removes the correct line and keeps remaining order", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "新增明細" }));
    fireEvent.click(screen.getByRole("button", { name: "新增明細" }));
    const reasons = screen.getAllByLabelText(
      "人工價格理由",
    ) as HTMLInputElement[];
    fireEvent.change(reasons[0], { target: { value: "first" } });
    fireEvent.change(reasons[1], { target: { value: "second" } });
    fireEvent.change(reasons[2], { target: { value: "third" } });

    fireEvent.click(screen.getAllByRole("button", { name: /移除第 2 列/ })[0]);
    const remaining = screen.getAllByLabelText(
      "人工價格理由",
    ) as HTMLInputElement[];
    expect(remaining.map((input) => input.value)).toEqual([
      "first",
      "third",
    ]);
  });

  it("omits unitPrice from the payload when left blank, and keeps existing line ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ id: ids.order })),
    );
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    fireEvent.change(screen.getByLabelText("未稅成交單價"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.draft.lines[0]).toEqual({
      id: ids.line1,
      itemId: ids.itemX,
      quantity: "2",
      manualPriceReason: null,
    });
  });
});

describe("P4.5b mutation contract", () => {
  it("POSTs to /api/sales-orders with idempotency header on create and navigates on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse({ id: "10000000-0000-4000-8000-000000000099" }),
      ),
    );
    render(<SalesOrderEditor customers={customers} items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "建立草稿" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/sales-orders");
    expect(init.method).toBe("POST");
    expect(init.headers["idempotency-key"]).toBe("test-idempotency-key");
    expect(pushMock).toHaveBeenCalledWith(
      "/sales-orders/10000000-0000-4000-8000-000000000099",
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("PATCHes to /api/sales-orders/{id} on edit with the exact draft payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ id: ids.order })),
    );
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`/api/sales-orders/${ids.order}`);
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      draft: {
        orderDate: "2026-07-27",
        customerId: ids.customerA,
        deliveryLocationId: ids.locationA1,
        customerContactId: ids.contactA1,
        paymentTermsText: "月結 30 天",
        lines: [
          {
            id: ids.line1,
            itemId: ids.itemX,
            quantity: "2",
            unitPrice: "500",
            manualPriceReason: null,
          },
        ],
      },
    });
  });

  it("disables the save button, marks it aria-busy while pending, and blocks a duplicate submit", async () => {
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
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", { name: "建立草稿" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(true),
    );
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveRequest(okResponse({ id: "10000000-0000-4000-8000-000000000099" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
  });
});

describe("P4.5b error recovery and pending", () => {
  it("shows the server error message on a non-2xx response and re-enables the button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failedResponse("客戶尚未授權此公司")),
    );
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", { name: "建立草稿" });
    fireEvent.click(button);
    expect(
      (await screen.findByText("客戶尚未授權此公司")).textContent,
    ).toBe("客戶尚未授權此公司");
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("recovers from a rejected fetch without an unhandled rejection", async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectRequest = reject;
          }),
      ),
    );
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", { name: "建立草稿" });
    fireEvent.click(button);
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(true),
    );
    rejectRequest(new Error("network down"));
    expect(
      (await screen.findByText("網路連線異常，請稍後再試一次")).textContent,
    ).toBe("網路連線異常，請稍後再試一次");
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("recovers from a JSON parse failure on the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })) as unknown as typeof fetch,
    );
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", { name: "建立草稿" });
    fireEvent.click(button);
    expect(
      (await screen.findByText("伺服器回應格式異常，請稍後再試一次"))
        .textContent,
    ).toBe("伺服器回應格式異常，請稍後再試一次");
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("allows a successful retry after a prior failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failedResponse("暫時失敗"))
      .mockResolvedValueOnce(
        okResponse({ id: "10000000-0000-4000-8000-000000000099" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", { name: "建立草稿" });
    fireEvent.click(button);
    await screen.findByText("暫時失敗");
    fireEvent.click(button);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("P4.5b server totals protection", () => {
  it("displays server-provided totals verbatim and never recomputes them from line edits", () => {
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    expect(
      screen.getByText("未稅 1000 + 運費 50 = 1050"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("數量"), {
      target: { value: "999" },
    });
    expect(
      screen.getByText("未稅 1000 + 運費 50 = 1050"),
    ).toBeTruthy();
  });
});

describe("P4.5b status actions (P4.5c-protected, unchanged)", () => {
  it("keeps confirm/void raw styling and endpoints untouched and never marks them busy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ id: ids.order })));
    vi.spyOn(window, "prompt").mockReturnValue("資料錯誤");
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    const confirmButton = screen.getByRole("button", { name: "確認訂單" });
    expect(confirmButton.className).toBe(
      "rounded-lg bg-blue-700 px-4 py-2 text-white",
    );
    expect(confirmButton.getAttribute("aria-busy")).toBeNull();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toBe(`/api/sales-orders/${ids.order}/confirm`);
    expect(
      JSON.parse(
        (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      ),
    ).toEqual({});

    const voidButton = screen.getByRole("button", { name: "作廢訂單" });
    fireEvent.click(voidButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(
      JSON.parse(
        (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
      ),
    ).toEqual({ reason: "資料錯誤" });
    expect(await screen.findByText("操作完成")).toBeTruthy();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("still renders the raw read-only snapshot details block unchanged", () => {
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    expect(screen.getByText("快照與來源資訊（唯讀）")).toBeTruthy();
  });
});

describe("P4.5b page contract", () => {
  it("keeps a single h1 and a single top-level main for /sales-orders/new composition", () => {
    const html = renderToStaticMarkup(
      <main data-testid="route-main">
        <PageHeader
          containerVariant="wide"
          context="P3.1 銷售流程"
          title="建立銷售訂單草稿"
          actions={
            <LinkButton href="/sales-orders" variant="secondary">
              返回清單
            </LinkButton>
          }
        />
        <SalesOrderEditor customers={customers} items={items} />
      </main>,
    );
    expect(html.match(/<main/g)?.length).toBe(1);
    expect(html.match(/<h1/g)?.length).toBe(1);
  });

  it("exposes an accessible editable line table with caption and column headers", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("訂單明細")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
  });

  it("does not introduce unsupported pricing preview, freight, effective-date or notes fields", () => {
    render(<SalesOrderEditor customers={customers} items={items} />);
    expect(screen.queryByText(/試算|預覽運費|即時價格/)).toBeNull();
    expect(screen.queryByLabelText(/運費/)).toBeNull();
    expect(screen.queryByLabelText(/預計送貨日/)).toBeNull();
    expect(screen.queryByLabelText(/備註/)).toBeNull();
    expect(screen.queryByLabelText(/客戶採購單號/)).toBeNull();
  });
});

describe("P4.5b pure helpers", () => {
  it("formats an item option label as code－name", () => {
    expect(formatItemOptionLabel(items[0])).toBe("ITEM-X－品項X");
  });

  it("filters items by code or name, case-insensitively", () => {
    expect(filterItemOptions(items, "item-y")).toEqual([items[1]]);
    expect(filterItemOptions(items, "品項")).toEqual(items);
    expect(filterItemOptions(items, "")).toEqual(items);
  });

  it("exposes unchanged draft-only status predicates", () => {
    expect(canStartSalesOrderRevision("CONFIRMED")).toBe(true);
    expect(canVoidSalesOrder("SHIPPED")).toBe(false);
  });
});

describe("P4.5b correction: save robustness stays isolated from status actions", () => {
  it("blocks a second concurrent save via a synchronous guard, independent of the disabled attribute", async () => {
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
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", {
      name: "建立草稿",
    }) as HTMLButtonElement;

    fireEvent.click(button);
    // Forcibly clear the disabled attribute so a second click cannot be blocked
    // by the DOM alone — only an internal synchronous re-entrancy guard can stop it.
    button.disabled = false;
    fireEvent.click(button);

    resolveRequest(okResponse({ id: "10000000-0000-4000-8000-000000000099" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers save pending/disabled state after a rejected fetch and allows a fresh submit", async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectRequest = reject;
          }),
      ),
    );
    render(<SalesOrderEditor customers={customers} items={items} />);
    const button = screen.getByRole("button", {
      name: "建立草稿",
    }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    rejectRequest(new Error("network down"));
    await screen.findByText("網路連線異常，請稍後再試一次");
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("keeps the pre-P4.5b non-2xx message behavior for status actions unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failedResponse("僅 CONFIRMED 可修訂")),
    );
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    expect(await screen.findByText("僅 CONFIRMED 可修訂")).toBeTruthy();
    // Status-action failures must not render the save-specific Alert/adapter UI.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not convert a rejected fetch on a status action into the save-specific generic message", async () => {
    const rejectionReasons: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      rejectionReasons.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.reject(new Error("network down"))),
      );
      render(
        <SalesOrderEditor
          customers={customers}
          items={items}
          initial={initialDraft}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
      await waitFor(() => expect(rejectionReasons.length).toBeGreaterThan(0));
      expect((rejectionReasons[0] as Error).message).toBe("network down");
      expect(
        screen.queryByText("網路連線異常，請稍後再試一次"),
      ).toBeNull();
      // The original request() leaves "處理中…" on the screen when the fetch
      // promise itself rejects — the pre-P4.5b behavior we are restoring here.
      expect(screen.getByText("處理中…")).toBeTruthy();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("does not convert a JSON parse failure on a status action into the save-specific generic message", async () => {
    const rejectionReasons: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      rejectionReasons.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        })) as unknown as typeof fetch,
      );
      render(
        <SalesOrderEditor
          customers={customers}
          items={items}
          initial={initialDraft}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
      await waitFor(() => expect(rejectionReasons.length).toBeGreaterThan(0));
      expect(rejectionReasons[0]).toBeInstanceOf(SyntaxError);
      expect(
        screen.queryByText("伺服器回應格式異常，請稍後再試一次"),
      ).toBeNull();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("keeps confirm/void endpoint, body and window.prompt behavior unchanged after the correction", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ id: ids.order })));
    vi.spyOn(window, "prompt").mockReturnValue("資料錯誤");
    render(
      <SalesOrderEditor
        customers={customers}
        items={items}
        initial={initialDraft}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "確認訂單" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toBe(`/api/sales-orders/${ids.order}/confirm`);
    expect(
      JSON.parse(
        (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      ),
    ).toEqual({});
    expect(await screen.findByText("操作完成")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "作廢訂單" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(window.prompt).toHaveBeenCalledWith("請輸入作廢理由");
    expect(
      JSON.parse(
        (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
      ),
    ).toEqual({ reason: "資料錯誤" });
  });
});
