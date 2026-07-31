import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DeliveryNoteDetailView,
  DeliveryNoteListView,
  type DeliveryNoteListItemView,
} from "../../src/app/(authenticated)/delivery-notes/delivery-note-view";
import DeliveryNotesLoading from "../../src/app/(authenticated)/delivery-notes/loading";
import { deliveryNoteOrderAction } from "../../src/app/(authenticated)/sales-orders/delivery-note-order-actions";
import type {
  DeliveryNoteDetailDto,
  DeliveryNoteMutationResponseDto,
  DeliveryNoteSummaryDto,
} from "../../src/lib/delivery-notes/api-types";
import {
  createDeliveryNote,
  createPrintMutationSession,
  DeliveryNoteClientError,
  downloadDeliveryNotePdf,
  filenameFromContentDisposition,
  formalPrintDeliveryNote,
  rebuildDeliveryNote,
  reprintDeliveryNote,
  singleFlight,
  voidDeliveryNote,
} from "../../src/lib/delivery-notes/client";
import {
  deliveryNotePrintActions,
} from "../../src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions";

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
    actualDeliveryDate: null,
    firstPrintedAt: null,
    firstPrintedById: null,
    firstPrintedBy: null,
    reprintCount: 0,
    formalPdf: null,
    printCapabilities: {
      canFormalPrint: true,
      canReprint: false,
      canDownload: false,
    },
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

  it("renders formal PDF metadata and first-print summary", () => {
    const html = renderToStaticMarkup(
      <DeliveryNoteDetailView
        note={detail({
          status: "SHIPPED",
          actualDeliveryDate: "2026-07-28",
          firstPrintedAt: "2026-07-28T01:00:00.000Z",
          firstPrintedById: ids.actor,
          firstPrintedBy: { id: ids.actor, username: "admin" },
          reprintCount: 2,
          formalPdf: {
            id: "10000000-0000-4000-8000-000000000008",
            filename: "DN-IN-202607-000001.pdf",
            byteSize: 77266,
            generatedAt: "2026-07-28T01:00:00.000Z",
            generatedBy: { id: ids.actor, username: "admin" },
          },
          printCapabilities: {
            canFormalPrint: false,
            canReprint: true,
            canDownload: true,
          },
        })}
      />,
    );
    expect(html).toContain("正式列印摘要");
    expect(html).toContain("2026-07-28");
    expect(html).toContain("admin");
    expect(html).toContain("補印次數");
    expect(html).toContain(">2<");
    expect(html).toContain("DN-IN-202607-000001.pdf");
  });

  it("renders an accessible loading state", () => {
    const html = renderToStaticMarkup(<DeliveryNotesLoading />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("正在載入銷貨單");
  });
});

describe("P3.3d print action capabilities", () => {
  it("shows formal print only for manageable ACTIVE notes", () => {
    expect(
      deliveryNotePrintActions({
        status: "ACTIVE",
        hasFormalPdf: false,
        canManage: true,
        canRead: true,
      }),
    ).toEqual({
      canFormalPrint: true,
      canReprint: false,
      canDownload: false,
    });
    expect(
      deliveryNotePrintActions({
        status: "ACTIVE",
        hasFormalPdf: false,
        canManage: false,
        canRead: true,
      }).canFormalPrint,
    ).toBe(false);
  });

  it("shows download to readers and reprint only to managers of SHIPPED notes", () => {
    expect(
      deliveryNotePrintActions({
        status: "SHIPPED",
        hasFormalPdf: true,
        canManage: false,
        canRead: true,
      }),
    ).toEqual({
      canFormalPrint: false,
      canReprint: false,
      canDownload: true,
    });
    expect(
      deliveryNotePrintActions({
        status: "SHIPPED",
        hasFormalPdf: true,
        canManage: true,
        canRead: true,
      }).canReprint,
    ).toBe(true);
    expect(
      deliveryNotePrintActions({
        status: "VOIDED",
        hasFormalPdf: false,
        canManage: true,
        canRead: true,
      }),
    ).toEqual({
      canFormalPrint: false,
      canReprint: false,
      canDownload: false,
    });
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

  it("rebuilds with a trimmed reason and preserves the detail response", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(mutationResponse(), { status: 200 }),
    );
    await expect(
      rebuildDeliveryNote(ids.order, 2, "  修訂後重建  ", fetcher),
    ).resolves.toMatchObject({
      deliveryNote: { id: ids.note },
      correlationId: "request-1",
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/sales-orders/${ids.order}/delivery-note/rebuild`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": expect.any(String),
        }),
        body: JSON.stringify({
          expectedRevisionNo: 2,
          reason: "修訂後重建",
        }),
      }),
    );
  });

  it("preserves rebuild typed errors, correlation ID and message", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "DELIVERY_NOTE_REPLACEMENT_CONFLICT",
            message: "銷貨單已由其他操作重建",
          },
          correlationId: "request-rebuild-conflict",
        },
        { status: 409 },
      ),
    );
    await expect(
      rebuildDeliveryNote(ids.order, 2, "重新建立", fetcher),
    ).rejects.toMatchObject({
      status: 409,
      code: "DELIVERY_NOTE_REPLACEMENT_CONFLICT",
      message: "銷貨單已由其他操作重建",
      correlationId: "request-rebuild-conflict",
    });
  });

  it("validates rebuild reason before calling the API", () => {
    const fetcher = vi.fn();
    expect(() => rebuildDeliveryNote(ids.order, 2, "   ", fetcher)).toThrow(
      DeliveryNoteClientError,
    );
    expect(fetcher).not.toHaveBeenCalled();
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

describe("P3.3d print mutation and download client", () => {
  function printResponse(reprintCount = 0) {
    return {
      deliveryNote: {
        id: ids.note,
        number: "DN-IN-202607-000001",
        status: "SHIPPED" as const,
        actualDeliveryDate: "2026-07-28",
        firstPrintedAt: "2026-07-28T01:00:00.000Z",
        firstPrintedBy: { id: ids.actor, username: "admin" },
        reprintCount,
      },
      salesOrder: {
        id: ids.order,
        number: "SO-IN-202607-000001",
        status: "SHIPPED" as const,
      },
      printVersion: {
        id: "10000000-0000-4000-8000-000000000008",
        documentVersion: 1,
        rendererVersion: "renderer-v1",
        templateVersion: "template-v1",
        fontVersion: "font-v1",
        snapshotVersion: "delivery-note-snapshot-v1",
        filename: "正式銷貨單.pdf",
        byteSize: 10,
        sha256: "a".repeat(64),
        mimeType: "application/pdf",
      },
      printEvent: {
        id: "10000000-0000-4000-8000-000000000009",
        type: reprintCount ? ("REPRINT" as const) : ("FORMAL_PRINT" as const),
      },
      downloadUrl: `/api/delivery-notes/${ids.note}/pdf`,
      replayed: false,
      correlationId: "print-request",
    };
  }

  it("sends strict formal-print and reprint mutations with the caller key", async () => {
    const fetcher = vi.fn(async (url: string) =>
      Response.json(
        url.endsWith("/reprint")
          ? printResponse(1)
          : printResponse(),
      ),
    );
    await formalPrintDeliveryNote(ids.note, "formal-key", fetcher);
    await reprintDeliveryNote(ids.note, "reprint-key", fetcher);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `/api/delivery-notes/${ids.note}/formal-print`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": "formal-key",
        }),
        body: "{}",
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/api/delivery-notes/${ids.note}/reprint`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "idempotency-key": "reprint-key",
        }),
      }),
    );
  });

  it("reuses one operation key for retry and creates a new key for a new operation", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network timeout"))
      .mockResolvedValueOnce(Response.json(printResponse(1)))
      .mockResolvedValueOnce(Response.json(printResponse(2)));
    const first = createPrintMutationSession(
      "reprint",
      ids.note,
      fetcher,
    );
    await expect(first.execute()).rejects.toThrow("network timeout");
    await expect(first.execute()).resolves.toMatchObject({
      deliveryNote: { reprintCount: 1 },
    });
    const second = createPrintMutationSession(
      "reprint",
      ids.note,
      fetcher,
    );
    await second.execute();
    const firstKey = (
      fetcher.mock.calls[0]?.[1] as RequestInit
    ).headers as Record<string, string>;
    const retryKey = (
      fetcher.mock.calls[1]?.[1] as RequestInit
    ).headers as Record<string, string>;
    const secondKey = (
      fetcher.mock.calls[2]?.[1] as RequestInit
    ).headers as Record<string, string>;
    expect(firstKey["idempotency-key"]).toBe(
      retryKey["idempotency-key"],
    );
    expect(secondKey["idempotency-key"]).not.toBe(
      firstKey["idempotency-key"],
    );
  });

  it("downloads authenticated PDF blobs, clicks once and always revokes the URL", async () => {
    const fetcher = vi.fn(async () =>
      new Response(new TextEncoder().encode("%PDF-test"), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition":
            "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%E6%AD%A3%E5%BC%8F.pdf",
        },
      }),
    );
    const click = vi.fn();
    const remove = vi.fn();
    const revoke = vi.fn();
    const anchor = { href: "", download: "", click, remove };
    await expect(
      downloadDeliveryNotePdf(ids.note, fetcher, {
        createObjectUrl: () => "blob:pdf",
        revokeObjectUrl: revoke,
        createAnchor: () => anchor,
      }),
    ).resolves.toBe("正式.pdf");
    expect(fetcher).toHaveBeenCalledWith(
      `/api/delivery-notes/${ids.note}/pdf`,
      { method: "GET", cache: "no-store" },
    );
    expect(anchor.href).toBe("blob:pdf");
    expect(anchor.download).toBe("正式.pdf");
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:pdf");
  });

  it("rejects non-PDF content without creating a browser object URL", async () => {
    const createObjectUrl = vi.fn();
    await expect(
      downloadDeliveryNotePdf(
        ids.note,
        async () =>
          new Response("not pdf", {
            headers: { "content-type": "text/html" },
          }),
        {
          createObjectUrl,
          revokeObjectUrl: vi.fn(),
          createAnchor: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      code: "DOWNLOAD_CONTENT_TYPE_INVALID",
    });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("parses only safe Content-Disposition filenames and blocks SSR browser use", async () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''%E9%8A%B7%E8%B2%A8%E5%96%AE.pdf",
      ),
    ).toBe("銷貨單.pdf");
    expect(
      filenameFromContentDisposition(
        'attachment; filename="bad\r\nname.pdf"',
      ),
    ).toBeNull();
    await expect(
      downloadDeliveryNotePdf(
        ids.note,
        async () =>
          new Response(new TextEncoder().encode("%PDF-test"), {
            headers: { "content-type": "application/pdf" },
          }),
      ),
    ).rejects.toMatchObject({
      code: "DOWNLOAD_UNAVAILABLE",
    });
  });
});
