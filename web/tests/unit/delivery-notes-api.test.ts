import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionAuthenticationError } from "../../src/lib/auth/session";
import {
  adminVoidDeliveryNoteRequestSchema,
  createDeliveryNoteRequestSchema,
  deliveryNoteApiError,
  deliveryNoteListQuerySchema,
  deliveryNoteMutationResponse,
  deliveryNoteRequestId,
  mapDeliveryNoteDetail,
  rebuildDeliveryNoteRequestSchema,
  requireDeliveryNoteIdempotencyKey,
} from "../../src/lib/delivery-notes/api";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteAlreadyExistsError,
  DeliveryNoteDownstreamLockedError,
  DeliveryNoteInvariantError,
  DeliveryNoteNotFoundError,
  DeliveryNoteRebuildRequiredError,
} from "../../src/lib/delivery-notes/errors";
import type { DeliveryNoteDetail } from "../../src/lib/delivery-notes/types";

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  order: "10000000-0000-4000-8000-000000000002",
  note: "10000000-0000-4000-8000-000000000003",
  line: "10000000-0000-4000-8000-000000000004",
  orderLine: "10000000-0000-4000-8000-000000000005",
  item: "10000000-0000-4000-8000-000000000006",
  actor: "10000000-0000-4000-8000-000000000007",
};

function detailFixture(
  overrides: Partial<DeliveryNoteDetail> = {},
): DeliveryNoteDetail {
  return {
    id: ids.note,
    companyId: ids.company,
    deliveryNoteNumber: "DN-IN-202607-000001",
    deliveryNoteDate: "2026-07-27",
    fiscalYear: 2026,
    fiscalMonth: 7,
    salesOrderId: ids.order,
    salesOrderNumber: "SO-IN-202607-000001",
    salesOrderRevisionNo: 2,
    status: "ACTIVE",
    customerName: "測試客戶",
    subtotal: "123456789012345678",
    freightAmount: "20",
    totalAmount: "123456789012345698",
    createdAt: "2026-07-27T03:00:00.000Z",
    companySnapshot: { name: "測試公司" },
    customerSnapshot: { name: "測試客戶" },
    customerCompanySnapshot: { customerCode: "C001" },
    contactSnapshot: null,
    deliverySnapshot: { fullAddress: "測試地址" },
    paymentTermsText: null,
    freightSnapshot: { mode: "FIXED_PER_LOCATION" },
    createdById: ids.actor,
    createdBy: { id: ids.actor, username: "admin" },
    replacedDeliveryNoteId: null,
    replacementDeliveryNoteId: null,
    replacedDeliveryNote: null,
    replacementDeliveryNote: null,
    voidSource: null,
    voidedAt: null,
    voidedById: null,
    voidedBy: null,
    voidReason: null,
    lines: [
      {
        id: ids.line,
        lineNumber: 1,
        salesOrderLineId: ids.orderLine,
        itemId: ids.item,
        itemSnapshot: { code: "ITEM-1" },
        priceSnapshot: { priceSource: "MANUAL" },
        quantity: "1.2345",
        unitPrice: "10.12345",
        lineAmount: "12",
      },
    ],
    ...overrides,
  };
}

describe("delivery-note API validation and serialization", () => {
  it("accepts only expected revision for create", () => {
    expect(
      createDeliveryNoteRequestSchema.parse({ expectedRevisionNo: 1 }),
    ).toEqual({ expectedRevisionNo: 1 });
    expect(() =>
      createDeliveryNoteRequestSchema.parse({
        expectedRevisionNo: 1,
        companyId: ids.company,
        snapshotVersion: "attacker-version",
      }),
    ).toThrow();
  });

  it("validates rebuild reason and rejects replacement injection", () => {
    expect(
      rebuildDeliveryNoteRequestSchema.parse({
        expectedRevisionNo: 2,
        reason: "  訂單修訂  ",
      }),
    ).toEqual({ expectedRevisionNo: 2, reason: "訂單修訂" });
    expect(() =>
      rebuildDeliveryNoteRequestSchema.parse({
        expectedRevisionNo: 2,
        reason: "訂單修訂",
        oldDeliveryNoteId: ids.note,
      }),
    ).toThrow();
  });

  it("normalizes ADMIN void reason and rejects void source injection", () => {
    expect(
      adminVoidDeliveryNoteRequestSchema.parse({
        reason: "  管理員作廢  ",
      }),
    ).toEqual({ reason: "管理員作廢" });
    expect(() =>
      adminVoidDeliveryNoteRequestSchema.parse({
        reason: "管理員作廢",
        voidSource: "ADMIN_DIRECT",
      }),
    ).toThrow();
  });

  it("validates bounded list query, enum and dates", () => {
    expect(
      deliveryNoteListQuerySchema.parse({
        status: "VOIDED",
        page: "2",
        pageSize: "100",
        deliveryNoteDateFrom: "2026-07-01",
        deliveryNoteDateTo: "2026-07-31",
      }),
    ).toMatchObject({ status: "VOIDED", page: 2, pageSize: 100 });
    expect(() =>
      deliveryNoteListQuerySchema.parse({ pageSize: "101" }),
    ).toThrow();
    expect(() =>
      deliveryNoteListQuerySchema.parse({ status: "UNKNOWN" }),
    ).toThrow();
    expect(() =>
      deliveryNoteListQuerySchema.parse({
        deliveryNoteDateFrom: "2026-02-30",
      }),
    ).toThrow();
  });

  it("requires a nonblank bounded Idempotency-Key header", () => {
    expect(
      requireDeliveryNoteIdempotencyKey(
        new Request("http://localhost", {
          headers: { "idempotency-key": "  request-1  " },
        }),
      ),
    ).toBe("request-1");
    expect(() =>
      requireDeliveryNoteIdempotencyKey(
        new Request("http://localhost"),
      ),
    ).toThrow("Idempotency-Key");
    expect(() =>
      requireDeliveryNoteIdempotencyKey(
        new Request("http://localhost", {
          headers: { "idempotency-key": "x".repeat(256) },
        }),
      ),
    ).toThrow();
  });

  it("maps detail without floating point or unsafe runtime values", () => {
    const mapped = mapDeliveryNoteDetail(
      detailFixture({
        status: "VOIDED",
        voidSource: "ADMIN_DIRECT",
        voidReason: "作廢",
        voidedAt: "2026-07-27T04:00:00.000Z",
        voidedById: ids.actor,
        voidedBy: { id: ids.actor, username: "admin" },
        replacedDeliveryNote: {
          id: "10000000-0000-4000-8000-000000000008",
          deliveryNoteNumber: "DN-IN-202607-000000",
          deliveryNoteDate: "2026-07-26",
          salesOrderRevisionNo: 1,
          status: "VOIDED",
        },
      }),
    );
    expect(mapped.customer).toEqual({ name: "測試客戶" });
    expect(mapped.totalAmount).toBe("123456789012345698");
    expect(mapped.lines[0]).toMatchObject({
      quantity: "1.2345",
      unitPrice: "10.12345",
    });
    expect(mapped.replacedDeliveryNote?.deliveryNoteDate).toBe(
      "2026-07-26",
    );
    expect(mapped.voidedBy).toEqual({
      id: ids.actor,
      username: "admin",
    });
    expect(mapped.createdById).toBe(ids.actor);
    expect(mapped.createdBy).toEqual({
      id: ids.actor,
      username: "admin",
    });
    expect(Object.keys(mapped.createdBy).sort()).toEqual([
      "id",
      "username",
    ]);
    expect(mapped.createdAt).toBe("2026-07-27T03:00:00.000Z");
    expect(JSON.stringify(mapped.createdBy)).not.toMatch(
      /password|token|session|role|companyScope/i,
    );
    expect(() => JSON.stringify(mapped)).not.toThrow();
  });

  it("returns correlation ID in mutation body and header", async () => {
    const response = deliveryNoteMutationResponse(
      { deliveryNote: detailFixture(), replayed: false },
      "request-123",
      201,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("request-123");
    await expect(response.json()).resolves.toMatchObject({
      replayed: false,
      correlationId: "request-123",
      deliveryNote: {
        totalAmount: "123456789012345698",
        createdById: ids.actor,
        createdBy: { id: ids.actor, username: "admin" },
      },
    });
  });

  it("preserves or safely creates a request correlation ID", () => {
    expect(
      deliveryNoteRequestId(
        new Request("http://localhost", {
          headers: { "x-request-id": "request-123" },
        }),
      ),
    ).toBe("request-123");
    expect(
      deliveryNoteRequestId(
        new Request("http://localhost", {
          headers: { "x-request-id": "invalid value" },
        }),
      ),
    ).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("delivery-note API error mapping", () => {
  it.each([
    [new SessionAuthenticationError(), 401],
    [new DeliveryNoteAccessDeniedError(), 403],
    [new DeliveryNoteNotFoundError(), 404],
    [new DeliveryNoteAlreadyExistsError(), 409],
    [new DeliveryNoteRebuildRequiredError(), 409],
    [new DeliveryNoteDownstreamLockedError(), 409],
    [new DeliveryNoteInvariantError("不一致"), 422],
  ])("maps typed error consistently", async (error, status) => {
    const response = deliveryNoteApiError(error, "request-error");
    expect(response.status).toBe(status);
    expect(response.headers.get("x-request-id")).toBe("request-error");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: (error as { code: string }).code,
      },
      correlationId: "request-error",
    });
  });

  it("does not expose stack, SQL or Prisma internals", async () => {
    const error = new Error(
      "SELECT password_hash FROM users; PrismaClientKnownRequestError",
    );
    const response = deliveryNoteApiError(error, "request-safe");
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("SELECT");
    expect(JSON.stringify(body)).not.toContain("Prisma");
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "處理銷貨單時發生錯誤",
      },
      correlationId: "request-safe",
    });
  });
});

const routeMocks = vi.hoisted(() => ({
  context: vi.fn(),
  create: vi.fn(),
  rebuild: vi.fn(),
  adminVoid: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  current: vi.fn(),
}));

vi.mock("@/lib/auth/request-context", () => ({
  getApiRequestContext: routeMocks.context,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/delivery-notes/service", () => ({
  createDeliveryNoteFromOrder: routeMocks.create,
  rebuildDeliveryNoteForOrder: routeMocks.rebuild,
  adminVoidDeliveryNote: routeMocks.adminVoid,
  listDeliveryNotes: routeMocks.list,
  getDeliveryNote: routeMocks.detail,
  getCurrentDeliveryNoteForOrder: routeMocks.current,
}));

import {
  GET as currentGet,
  POST as createPost,
} from "../../src/app/api/sales-orders/[id]/delivery-note/route";
import { POST as rebuildPost } from "../../src/app/api/sales-orders/[id]/delivery-note/rebuild/route";
import { GET as listGet } from "../../src/app/api/delivery-notes/route";
import { GET as detailGet } from "../../src/app/api/delivery-notes/[id]/route";
import { POST as voidPost } from "../../src/app/api/delivery-notes/[id]/void/route";

function routeContext() {
  return {
    actor: { userId: ids.actor, username: "admin" },
    session: {
      sessionId: "10000000-0000-4000-8000-000000000009",
    },
    requestId: "route-request",
    roleCodes: ["ADMIN"],
    authorizedCompanies: [
      { id: ids.company, code: "IN", name: "實業" },
    ],
    selectedCompany: { id: ids.company, code: "IN", name: "實業" },
  };
}

function nextRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers: {
      "x-request-id": "route-request",
      origin: "http://localhost",
      ...(options.idempotencyKey
        ? { "idempotency-key": options.idempotencyKey }
        : {}),
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

describe("delivery-note route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.context.mockResolvedValue(routeContext());
    routeMocks.create.mockResolvedValue({
      deliveryNote: detailFixture(),
      replayed: false,
    });
    routeMocks.rebuild.mockResolvedValue({
      deliveryNote: detailFixture(),
      replayed: false,
    });
    routeMocks.adminVoid.mockResolvedValue({
      deliveryNote: detailFixture({ status: "VOIDED" }),
      replayed: false,
    });
    routeMocks.detail.mockResolvedValue(detailFixture());
    routeMocks.current.mockResolvedValue(detailFixture());
    routeMocks.list.mockResolvedValue({
      deliveryNotes: [detailFixture()],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it("creates through service using selected company and header key", async () => {
    const response = await createPost(
      nextRequest(`/api/sales-orders/${ids.order}/delivery-note`, {
        method: "POST",
        body: { expectedRevisionNo: 2 },
        idempotencyKey: "create-key",
      }),
      { params: Promise.resolve({ id: ids.order }) },
    );
    expect(response.status).toBe(201);
    expect(routeMocks.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        companyId: ids.company,
        salesOrderId: ids.order,
        expectedRevisionNo: 2,
        idempotencyKey: "create-key",
      }),
    );
  });

  it("rejects missing idempotency key and body injection before service", async () => {
    const missingKey = await createPost(
      nextRequest(`/api/sales-orders/${ids.order}/delivery-note`, {
        method: "POST",
        body: { expectedRevisionNo: 2 },
      }),
      { params: Promise.resolve({ id: ids.order }) },
    );
    expect(missingKey.status).toBe(400);
    const injected = await createPost(
      nextRequest(`/api/sales-orders/${ids.order}/delivery-note`, {
        method: "POST",
        body: {
          expectedRevisionNo: 2,
          companyId: "attacker",
          status: "VOIDED",
          snapshotVersion: "attacker-version",
        },
        idempotencyKey: "injected",
      }),
      { params: Promise.resolve({ id: ids.order }) },
    );
    expect(injected.status).toBe(400);
    expect(routeMocks.create).not.toHaveBeenCalled();
  });

  it("rebuilds and ADMIN-voids only through formal services", async () => {
    const rebuild = await rebuildPost(
      nextRequest(
        `/api/sales-orders/${ids.order}/delivery-note/rebuild`,
        {
          method: "POST",
          body: { expectedRevisionNo: 2, reason: "修訂" },
          idempotencyKey: "rebuild-key",
        },
      ),
      { params: Promise.resolve({ id: ids.order }) },
    );
    expect(rebuild.status).toBe(200);
    expect(routeMocks.rebuild).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        companyId: ids.company,
        reason: "修訂",
      }),
    );

    const voided = await voidPost(
      nextRequest(`/api/delivery-notes/${ids.note}/void`, {
        method: "POST",
        body: { reason: "管理員作廢" },
        idempotencyKey: "void-key",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(voided.status).toBe(200);
    expect(routeMocks.adminVoid).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        deliveryNoteId: ids.note,
        voidReason: "管理員作廢",
      }),
    );
  });

  it("maps authentication, permission and conflict errors", async () => {
    routeMocks.context.mockRejectedValueOnce(
      new SessionAuthenticationError(),
    );
    expect(
      (
        await listGet(
          nextRequest("/api/delivery-notes"),
        )
      ).status,
    ).toBe(401);

    routeMocks.context.mockResolvedValue(routeContext());
    routeMocks.adminVoid.mockRejectedValueOnce(
      new DeliveryNoteAccessDeniedError(),
    );
    expect(
      (
        await voidPost(
          nextRequest(`/api/delivery-notes/${ids.note}/void`, {
            method: "POST",
            body: { reason: "拒絕" },
            idempotencyKey: "denied",
          }),
          { params: Promise.resolve({ id: ids.note }) },
        )
      ).status,
    ).toBe(403);

    routeMocks.rebuild.mockRejectedValueOnce(
      new DeliveryNoteRebuildRequiredError(),
    );
    expect(
      (
        await rebuildPost(
          nextRequest(
            `/api/sales-orders/${ids.order}/delivery-note/rebuild`,
            {
              method: "POST",
              body: { expectedRevisionNo: 2, reason: "衝突" },
              idempotencyKey: "conflict",
            },
          ),
          { params: Promise.resolve({ id: ids.order }) },
        )
      ).status,
    ).toBe(409);
  });

  it("returns list, detail and current-note DTOs without Prisma objects", async () => {
    const list = await listGet(
      nextRequest("/api/delivery-notes?status=ACTIVE&page=1&pageSize=20"),
    );
    const listBody = await list.json();
    expect(listBody).toMatchObject({
      items: [{ customer: { name: "測試客戶" } }],
      page: 1,
      correlationId: "route-request",
    });
    expect(listBody.items[0]).not.toHaveProperty("createdById");
    expect(listBody.items[0]).not.toHaveProperty("createdBy");
    expect(routeMocks.list).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        companyId: ids.company,
        filters: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );

    const detail = await detailGet(
      nextRequest(`/api/delivery-notes/${ids.note}`),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(await detail.json()).toMatchObject({
      deliveryNote: {
        id: ids.note,
        createdById: ids.actor,
        createdBy: { id: ids.actor, username: "admin" },
      },
      correlationId: "route-request",
    });

    const current = await currentGet(
      nextRequest(`/api/sales-orders/${ids.order}/delivery-note`),
      { params: Promise.resolve({ id: ids.order }) },
    );
    expect(await current.json()).toMatchObject({
      deliveryNote: {
        id: ids.note,
        createdById: ids.actor,
        createdBy: { id: ids.actor, username: "admin" },
      },
    });
  });

  it("returns null current note and rejects invalid IDs and abusive query", async () => {
    routeMocks.current.mockResolvedValueOnce(null);
    const current = await currentGet(
      nextRequest(`/api/sales-orders/${ids.order}/delivery-note`),
      { params: Promise.resolve({ id: ids.order }) },
    );
    await expect(current.json()).resolves.toMatchObject({
      deliveryNote: null,
    });

    const badId = await detailGet(
      nextRequest("/api/delivery-notes/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badId.status).toBe(400);

    const abusive = await listGet(
      nextRequest("/api/delivery-notes?pageSize=1000"),
    );
    expect(abusive.status).toBe(400);
  });
});
