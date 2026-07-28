import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionAuthenticationError } from "../../src/lib/auth/session";
import {
  mapDeliveryNoteApiError,
} from "../../src/lib/delivery-notes/api";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteFormalPrintExistsError,
  DeliveryNoteFormalPrintMissingError,
  DeliveryNotePdfRenderError,
  DeliveryNotePrintConcurrencyError,
  DeliveryNoteSnapshotValidationError,
} from "../../src/lib/delivery-notes/errors";
import {
  deliveryNotePdfContentDisposition,
  deliveryNotePdfResponse,
  getDeliveryNotePdfDownload,
} from "../../src/lib/delivery-notes/print-download";
import {
  parseDeliveryNotePrintRequest,
} from "../../src/lib/delivery-notes/print-api";

const routeMocks = vi.hoisted(() => ({
  context: vi.fn(),
  formalPrint: vi.fn(),
  reprint: vi.fn(),
  dbFind: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { deliveryNote: { findFirst: routeMocks.dbFind } },
}));
vi.mock("@/lib/auth/request-context", () => ({
  getApiRequestContext: routeMocks.context,
}));
vi.mock("@/lib/delivery-notes/formal-print", () => ({
  formalPrintDeliveryNote: routeMocks.formalPrint,
  reprintDeliveryNote: routeMocks.reprint,
}));

import { POST as formalPrintPost } from "../../src/app/api/delivery-notes/[id]/formal-print/route";
import { GET as pdfGet } from "../../src/app/api/delivery-notes/[id]/pdf/route";
import { POST as reprintPost } from "../../src/app/api/delivery-notes/[id]/reprint/route";

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  note: "10000000-0000-4000-8000-000000000002",
  order: "10000000-0000-4000-8000-000000000003",
  actor: "10000000-0000-4000-8000-000000000004",
  version: "10000000-0000-4000-8000-000000000005",
  event: "10000000-0000-4000-8000-000000000006",
};

function context(roleCodes = ["ADMIN"]) {
  return {
    actor: { userId: ids.actor, username: "admin" },
    session: {
      sessionId: "10000000-0000-4000-8000-000000000007",
    },
    requestId: "print-request",
    roleCodes,
    authorizedCompanies: [
      { id: ids.company, code: "IN", name: "實業" },
    ],
    selectedCompany: { id: ids.company, code: "IN", name: "實業" },
  };
}

function result(replayed = false) {
  return {
    deliveryNoteId: ids.note,
    deliveryNoteNumber: "DN-IN-202607-000001",
    deliveryNoteStatus: "SHIPPED" as const,
    salesOrderId: ids.order,
    salesOrderNumber: "SO-IN-202607-000001",
    salesOrderStatus: "SHIPPED" as const,
    actualDeliveryDate: "2026-07-28",
    firstPrintedAt: "2026-07-28T01:00:00.000Z",
    firstPrintedById: ids.actor,
    reprintCount: 0,
    printVersionId: ids.version,
    printEventId: ids.event,
    documentVersion: 1,
    rendererVersion: "renderer-v1",
    templateVersion: "template-v1",
    fontVersion: "font-v1",
    snapshotVersion: "delivery-note-snapshot-v1",
    contentHash: "a".repeat(64),
    mimeType: "application/pdf",
    byteSize: 123,
    filename: "DN-IN-202607-000001.pdf",
    replayed,
  };
}

function request(
  path: string,
  options: {
    method?: string;
    body?: string;
    key?: string;
  } = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers: {
      origin: "http://localhost",
      "x-request-id": "print-request",
      ...(options.key ? { "idempotency-key": options.key } : {}),
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

describe("P3.3d print route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.context.mockResolvedValue(context());
    routeMocks.formalPrint.mockResolvedValue(result());
    routeMocks.reprint.mockResolvedValue({
      ...result(),
      reprintCount: 1,
    });
    const routeBytes = new TextEncoder().encode("%PDF-route");
    routeMocks.dbFind.mockResolvedValue({
      id: ids.note,
      printVersions: [{
        pdfBytes: routeBytes,
        byteSize: routeBytes.byteLength,
        contentHash: createHash("sha256")
          .update(routeBytes)
          .digest("hex"),
        mimeType: "application/pdf",
        filename: "正式銷貨單.pdf",
      }],
    });
  });

  it("calls the formal-print service with selected company and header key", async () => {
    const response = await formalPrintPost(
      request(`/api/delivery-notes/${ids.note}/formal-print`, {
        method: "POST",
        body: "{}",
        key: "formal-key",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(response.status).toBe(200);
    expect(routeMocks.formalPrint).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        companyId: ids.company,
        deliveryNoteId: ids.note,
        idempotencyKey: "formal-key",
      }),
    );
    const body = await response.json();
    expect(body).toMatchObject({
      deliveryNote: {
        id: ids.note,
        status: "SHIPPED",
        firstPrintedBy: { username: "admin" },
      },
      printVersion: {
        id: ids.version,
        sha256: "a".repeat(64),
      },
      printEvent: { type: "FORMAL_PRINT" },
      downloadUrl: `/api/delivery-notes/${ids.note}/pdf`,
      replayed: false,
      correlationId: "print-request",
    });
    expect(JSON.stringify(body)).not.toContain("pdfBytes");
    expect(JSON.stringify(body)).not.toContain("base64");
  });

  it("accepts an empty body and rejects unknown caller-controlled fields", async () => {
    const empty = await formalPrintPost(
      request(`/api/delivery-notes/${ids.note}/formal-print`, {
        method: "POST",
        key: "empty-body",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(empty.status).toBe(200);

    const injected = await formalPrintPost(
      request(`/api/delivery-notes/${ids.note}/formal-print`, {
        method: "POST",
        body: JSON.stringify({
          actualDeliveryDate: "2026-07-01",
          reprintCount: 99,
        }),
        key: "injected",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(injected.status).toBe(400);
  });

  it("rejects missing/invalid key and malformed route id before the service", async () => {
    const missing = await reprintPost(
      request(`/api/delivery-notes/${ids.note}/reprint`, {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(missing.status).toBe(400);
    const invalid = await reprintPost(
      request(`/api/delivery-notes/${ids.note}/reprint`, {
        method: "POST",
        body: "{}",
        key: "x".repeat(256),
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(invalid.status).toBe(400);
    const badId = await formalPrintPost(
      request("/api/delivery-notes/not-a-uuid/formal-print", {
        method: "POST",
        body: "{}",
        key: "bad-id",
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badId.status).toBe(400);
  });

  it("maps unauthenticated access to 401", async () => {
    routeMocks.context.mockRejectedValueOnce(
      new SessionAuthenticationError(),
    );
    const response = await formalPrintPost(
      request(`/api/delivery-notes/${ids.note}/formal-print`, {
        method: "POST",
        body: "{}",
        key: "unauthenticated",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(response.status).toBe(401);
  });

  it("maps manage permission/company-scope denial to 403", async () => {
    routeMocks.formalPrint.mockRejectedValueOnce(
      new DeliveryNoteAccessDeniedError(),
    );
    const response = await formalPrintPost(
      request(`/api/delivery-notes/${ids.note}/formal-print`, {
        method: "POST",
        body: "{}",
        key: "forbidden",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(response.status).toBe(403);
  });

  it("keeps reprint separate and identifies the REPRINT event", async () => {
    const response = await reprintPost(
      request(`/api/delivery-notes/${ids.note}/reprint`, {
        method: "POST",
        body: "{}",
        key: "reprint-key",
      }),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(routeMocks.reprint).toHaveBeenCalledTimes(1);
    expect(routeMocks.formalPrint).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      deliveryNote: { reprintCount: 1 },
      printEvent: { type: "REPRINT" },
    });
  });

  it("returns authenticated PDF bytes with no-store download headers", async () => {
    const response = await pdfGet(
      request(`/api/delivery-notes/${ids.note}/pdf`),
      { params: Promise.resolve({ id: ids.note }) },
    );
    expect(routeMocks.dbFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: ids.company, id: ids.note },
      }),
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new TextEncoder().encode("%PDF-route"),
    );
  });
});

describe("P3.3d centralized error mapping", () => {
  it.each([
    [new DeliveryNoteFormalPrintMissingError(), 404],
    [new DeliveryNoteFormalPrintExistsError(), 409],
    [new DeliveryNotePrintConcurrencyError(), 409],
    [
      new DeliveryNoteSnapshotValidationError({
        deliveryNoteId: ids.note,
        snapshotVersion: "unsupported",
        path: "snapshot",
        reason: "internal detail",
      }),
      422,
    ],
    [
      new DeliveryNotePdfRenderError(
        "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
        "expected secret actual secret",
      ),
      500,
    ],
  ])("maps %s to HTTP %s without internal detail", (error, status) => {
    const mapped = mapDeliveryNoteApiError(error);
    expect(mapped.status).toBe(status);
    expect(mapped.message).not.toContain("internal detail");
    expect(mapped.message).not.toContain("secret");
  });
});

describe("P3.3d download integrity and filename", () => {
  const bytes = new TextEncoder().encode("%PDF-valid");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const readContext = context(["ORDER_ENTRY"]);

  function database(versionOverrides: Record<string, unknown> = {}) {
    const findFirst = vi.fn().mockResolvedValue({
      id: ids.note,
      printVersions: [
        {
          pdfBytes: bytes,
          byteSize: bytes.byteLength,
          contentHash: hash,
          mimeType: "application/pdf",
          filename: "正式銷貨單.pdf",
          ...versionOverrides,
        },
      ],
    });
    return {
      db: { deliveryNote: { findFirst } },
      findFirst,
    };
  }

  it("queries only the scoped note and binary version, without writes", async () => {
    const { db, findFirst } = database();
    const first = await getDeliveryNotePdfDownload(db as never, {
      context: readContext,
      companyId: ids.company,
      deliveryNoteId: ids.note,
    });
    const second = await getDeliveryNotePdfDownload(db as never, {
      context: readContext,
      companyId: ids.company,
      deliveryNoteId: ids.note,
    });
    expect(first.bytes).toEqual(bytes);
    expect(second.bytes).toEqual(bytes);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: ids.note, companyId: ids.company },
      select: expect.objectContaining({
        id: true,
        printVersions: {
          select: {
            pdfBytes: true,
            byteSize: true,
            contentHash: true,
            mimeType: true,
            filename: true,
          },
          take: 1,
        },
      }),
    });
    expect(db).not.toHaveProperty("$transaction");
  });

  it("rejects read permission or company-scope denial before the query", async () => {
    const { db, findFirst } = database();
    await expect(
      getDeliveryNotePdfDownload(db as never, {
        context: { ...readContext, roleCodes: [] },
        companyId: ids.company,
        deliveryNoteId: ids.note,
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
    await expect(
      getDeliveryNotePdfDownload(db as never, {
        context: readContext,
        companyId: "10000000-0000-4000-8000-000000000099",
        deliveryNoteId: ids.note,
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteAccessDeniedError);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { byteSize: 999 },
    { contentHash: "0".repeat(64) },
    { pdfBytes: new TextEncoder().encode("not-pdf") },
  ])("fails fast for invalid stored bytes (%s)", async (overrides) => {
    const { db } = database(overrides);
    await expect(
      getDeliveryNotePdfDownload(db as never, {
        context: readContext,
        companyId: ids.company,
        deliveryNoteId: ids.note,
      }),
    ).rejects.toMatchObject({
      code: "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
    });
  });

  it("uses a safe ASCII fallback plus RFC 5987 filename", () => {
    const value = deliveryNotePdfContentDisposition(
      "正式\r\n銷貨單.pdf",
    );
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).toContain('filename="');
    expect(value).toContain("filename*=UTF-8''");
  });

  it("returns the exact binary length", async () => {
    const response = deliveryNotePdfResponse(
      {
        bytes,
        byteSize: bytes.byteLength,
        contentHash: hash,
        mimeType: "application/pdf",
        filename: "delivery.pdf",
      },
      "download-request",
    );
    expect(response.headers.get("content-length")).toBe(
      String(bytes.byteLength),
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});

describe("strict empty print DTO", () => {
  it("accepts no body or an empty object only", async () => {
    await expect(
      parseDeliveryNotePrintRequest(new Request("http://localhost")),
    ).resolves.toEqual({});
    await expect(
      parseDeliveryNotePrintRequest(
        new Request("http://localhost", {
          method: "POST",
          body: "{}",
        }),
      ),
    ).resolves.toEqual({});
    await expect(
      parseDeliveryNotePrintRequest(
        new Request("http://localhost", {
          method: "POST",
          body: '{"status":"SHIPPED"}',
        }),
      ),
    ).rejects.toThrow();
  });
});
