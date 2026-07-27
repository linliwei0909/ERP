import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DeliveryNoteDetailView,
  DeliveryNoteListView,
  type DeliveryNoteListItemView,
} from "../../src/app/delivery-notes/delivery-note-view";
import { deliveryNoteOrderAction } from "../../src/app/sales-orders/delivery-note-order-actions";
import type {
  DeliveryNoteDetailDto,
  DeliveryNoteMutationResponseDto,
  DeliveryNoteSummaryDto,
} from "../../src/lib/delivery-notes/api-types";
import {
  createDeliveryNote,
  DeliveryNoteClientError,
  singleFlight,
  voidDeliveryNote,
} from "../../src/lib/delivery-notes/client";

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  order: "10000000-0000-4000-8000-000000000002",
  note: "10000000-0000-4000-8000-000000000003",
  line: "10000000-0000-4000-8000-000000000004",
  orderLine: "10000000-0000-4000-8000-000000000005",
  item: "10000000-0000-4000-8000-000000000006",
  actor: "10000000-0000-4000-8000-000000000007",
};

function summary(
  overrides: Partial<DeliveryNoteSummaryDto> = {},
): DeliveryNoteSummaryDto {
  return {
    id: ids.note,
    companyId: ids.company,
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

function detail(
  overrides: Partial<DeliveryNoteDetailDto> = {},
): DeliveryNoteDetailDto {
  return {
    ...summary(),
    companySnapshot: { companyName: "測試公司" },
    customerSnapshot: { name: "測試客戶" },
    customerCompanySnapshot: { customerCode: "C001" },
    contactSnapshot: { name: "王小明" },
    deliverySnapshot: {
      name: "台北倉",
      recipientName: "收件人",
      fullAddress: "台北市測試路 1 號",
    },
    paymentTermsText: "月結 30 天",
    freightSnapshot: { mode: "FIXED_PER_LOCATION" },
    createdById: ids.actor,
    createdBy: { id: ids.actor, username: "admin" },
    replacedDeliveryNoteId: null,
    replacementDeliveryNoteId: null,
    replacedDeliveryNote: null,
    replacementDeliveryNote: null,
    voidedById: null,
    voidedBy: null,
    lines: [
      {
        id: ids.line,
        lineNumber: 1,
        salesOrderLineId: ids.orderLine,
        itemId: ids.item,
        itemSnapshot: {
          companyItemCode: "ITEM-001",
          name: "測試品項",
          baseUnit: "PCS",
        },
        priceSnapshot: { priceSource: "STANDARD" },
        quantity: "2.0000",
        unitPrice: "50.00000",
        lineAmount: "100",
      },
    ],
    ...overrides,
  };
}

function mutationResponse(): DeliveryNoteMutationResponseDto {
  return {
    deliveryNote: detail(),
    replayed: false,
    correlationId: "request-1",
  };
}

describe("delivery-note UI rendering", () => {
  it("renders list columns, creator, filters and detail link", () => {
    const item: DeliveryNoteListItemView = {
      ...summary(),
      createdBy: { id: ids.actor, username: "admin" },
    };
    const html = renderToStaticMarkup(
      <DeliveryNoteListView
        company={{ code: "IN", name: "測試公司" }}
        items={[item]}
        page={1}
        totalPages={1}
        total={1}
        query={{
          status: "ALL",
          deliveryNoteNumber: "",
          customerKeyword: "",
          deliveryNoteDateFrom: "",
          deliveryNoteDateTo: "",
        }}
      />,
    );
    expect(html).toContain("銷貨單清單");
    expect(html).toContain("DN-IN-202607-000001");
    expect(html).toContain("SO-IN-202607-000001");
    expect(html).toContain("測試客戶");
    expect(html).toContain("admin");
    expect(html).toContain(`/delivery-notes/${ids.note}`);
  });

  it("renders empty state and detail snapshot without unauthorized action", () => {
    const empty = renderToStaticMarkup(
      <DeliveryNoteListView
        company={{ code: "IN", name: "測試公司" }}
        items={[]}
        page={1}
        totalPages={1}
        total={0}
        query={{
          status: "ALL",
          deliveryNoteNumber: "",
          customerKeyword: "",
          deliveryNoteDateFrom: "",
          deliveryNoteDateTo: "",
        }}
      />,
    );
    expect(empty).toContain("查無銷貨單");

    const html = renderToStaticMarkup(
      <DeliveryNoteDetailView note={detail()} />,
    );
    expect(html).toContain("台北市測試路 1 號");
    expect(html).toContain("測試品項");
    expect(html).toContain("建立者");
    expect(html).toContain("admin");
    expect(html).not.toContain("管理員作廢");
  });

  it("renders void information from the API contract", () => {
    const html = renderToStaticMarkup(
      <DeliveryNoteDetailView
        note={detail({
          status: "VOIDED",
          voidSource: "ADMIN_DIRECT",
          voidReason: "資料錯誤",
          voidedAt: "2026-07-27T04:00:00.000Z",
          voidedById: ids.actor,
          voidedBy: { id: ids.actor, username: "admin" },
        })}
      />,
    );
    expect(html).toContain("作廢資訊");
    expect(html).toContain("資料錯誤");
    expect(html).toContain("admin");
  });
});

describe("delivery-note order action permission and state", () => {
  it("shows create only for manageable confirmed orders without active note", () => {
    expect(
      deliveryNoteOrderAction({
        orderStatus: "CONFIRMED",
        revisionNo: 1,
        notes: [],
        canManage: true,
      }),
    ).toBe("create");
    expect(
      deliveryNoteOrderAction({
        orderStatus: "CONFIRMED",
        revisionNo: 1,
        notes: [],
        canManage: false,
      }),
    ).toBeNull();
    expect(
      deliveryNoteOrderAction({
        orderStatus: "DRAFT",
        revisionNo: 1,
        notes: [],
        canManage: true,
      }),
    ).toBeNull();
  });

  it("shows rebuild only when the active note is older than the order revision", () => {
    expect(
      deliveryNoteOrderAction({
        orderStatus: "CONFIRMED",
        revisionNo: 2,
        notes: [summary({ salesOrderRevisionNo: 1 })],
        canManage: true,
      }),
    ).toBe("rebuild");
    expect(
      deliveryNoteOrderAction({
        orderStatus: "CONFIRMED",
        revisionNo: 1,
        notes: [summary()],
        canManage: true,
      }),
    ).toBeNull();
  });
});

describe("delivery-note UI mutation client", () => {
  it("creates with idempotency and returns the detail response", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(mutationResponse(), { status: 201 }),
    );
    const result = await createDeliveryNote(ids.order, 1, fetcher);
    expect(result.deliveryNote.id).toBe(ids.note);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/sales-orders/${ids.order}/delivery-note`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": expect.any(String),
        }),
        body: JSON.stringify({ expectedRevisionNo: 1 }),
      }),
    );
  });

  it("preserves create conflict details for the order workflow", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "DELIVERY_NOTE_ALREADY_EXISTS",
            message: "訂單已有有效銷貨單",
          },
          correlationId: "request-conflict",
        },
        { status: 409 },
      ),
    );
    await expect(
      createDeliveryNote(ids.order, 1, fetcher),
    ).rejects.toMatchObject({
      status: 409,
      code: "DELIVERY_NOTE_ALREADY_EXISTS",
      message: "訂單已有有效銷貨單",
    });
  });

  it("voids successfully with a normalized reason and idempotency key", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        mutationResponse(),
        { status: 200 },
      ),
    );
    await expect(
      voidDeliveryNote(ids.note, "  管理員作廢  ", fetcher),
    ).resolves.toMatchObject({
      deliveryNote: { id: ids.note },
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/delivery-notes/${ids.note}/void`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": expect.any(String),
        }),
        body: JSON.stringify({ reason: "管理員作廢" }),
      }),
    );
  });

  it.each([
    [403, "AUTHORIZATION_DENIED", "沒有作廢權限"],
    [404, "DELIVERY_NOTE_NOT_FOUND", "找不到銷貨單"],
    [409, "DELIVERY_NOTE_CONFLICT", "銷貨單狀態衝突"],
  ])("preserves API error semantics for status %s", async (status, code, message) => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: { code, message },
          correlationId: "request-error",
        },
        { status },
      ),
    );
    await expect(
      voidDeliveryNote(ids.note, "作廢", fetcher),
    ).rejects.toMatchObject({
      status,
      code,
      message,
      correlationId: "request-error",
    });
  });

  it("validates void reason before calling the API", () => {
    const fetcher = vi.fn();
    expect(() => voidDeliveryNote(ids.note, "   ", fetcher)).toThrow(
      DeliveryNoteClientError,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("coalesces duplicate submissions into one mutation", async () => {
    let release!: (value: string) => void;
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const submit = singleFlight(operation);
    const first = submit();
    const second = submit();
    expect(operation).toHaveBeenCalledTimes(1);
    release("done");
    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
  });
});
