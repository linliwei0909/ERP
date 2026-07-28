import { createHash } from "node:crypto";
import { Prisma } from "../../src/generated/prisma/client";
import { describe, expect, it } from "vitest";
import {
  DeliveryNoteFontError,
  DeliveryNoteSnapshotValidationError,
} from "../../src/lib/delivery-notes/errors";
import {
  DELIVERY_NOTE_FONT_MANIFEST,
  DELIVERY_NOTE_REQUIRED_GLYPHS,
  loadDeliveryNoteFont,
} from "../../src/lib/delivery-notes/font";
import {
  parseDeliveryNoteSnapshot,
  type DeliveryNoteSnapshotSource,
} from "../../src/lib/delivery-notes/print-model";
import {
  DELIVERY_NOTE_PDF_MIME_TYPE,
  DELIVERY_NOTE_PDF_RENDERER_VERSION,
  DELIVERY_NOTE_PDF_TEMPLATE_VERSION,
  DeterministicDeliveryNotePdfRenderer,
} from "../../src/lib/delivery-notes/renderer";

function validSource(): DeliveryNoteSnapshotSource {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    companyId: "00000000-0000-0000-0000-000000000002",
    deliveryNoteNumber: "DN-IN-202607-000001",
    deliveryNoteDate: new Date("2026-07-28T00:00:00.000Z"),
    salesOrderId: "00000000-0000-0000-0000-000000000003",
    snapshotVersion: "delivery-note-snapshot-v1",
    companySnapshot: {
      code: "IND",
      companyName: "奇麗實業有限公司",
      companyTaxId: "12345678",
      companyAddress: "臺北市測試路一號",
      companyPhone: "02-12345678",
    },
    customerSnapshot: {
      customerCode: "C001",
      name: "繁體中文測試客戶",
      taxId: "87654321",
    },
    customerCompanySnapshot: {
      companyId: "00000000-0000-0000-0000-000000000002",
      customerCode: "C001",
    },
    contactSnapshot: { name: "陳小姐", phone: "02-22223333" },
    deliverySnapshot: {
      name: "臺北送貨點",
      fullAddress: "新北市測試區送貨路二號",
      recipientName: "王小明",
      phone: "0912-345-678",
    },
    paymentTermsText: "月結 30 天",
    salesOrderRevisionNo: 1,
    subtotal: new Prisma.Decimal("20"),
    freightAmount: new Prisma.Decimal("5"),
    totalAmount: new Prisma.Decimal("25"),
    salesOrder: {
      id: "00000000-0000-0000-0000-000000000003",
      companyId: "00000000-0000-0000-0000-000000000002",
      orderNumber: "SO-IN-202607-000001",
      customerId: "00000000-0000-0000-0000-000000000004",
    },
    lines: [
      {
        id: "00000000-0000-0000-0000-000000000005",
        lineNumber: 1,
        itemId: "00000000-0000-0000-0000-000000000006",
        itemSnapshot: {
          code: "ITEM-001",
          companyItemCode: "COMP-ITEM-001",
          name: "中文測試品項",
          specification: "規格 A-1",
          baseUnit: "PCS",
        },
        quantity: new Prisma.Decimal("2.0000"),
        unitPrice: new Prisma.Decimal("10.00000"),
        lineAmount: new Prisma.Decimal("20"),
      },
    ],
  };
}

const printContext = {
  actualDeliveryDate: new Date("2026-07-29T00:00:00.000Z"),
  formalPrintedAt: new Date("2026-07-28T16:30:00.000Z"),
};

describe("delivery-note snapshot v1 print model", () => {
  it("strictly parses the approved snapshot and freezes every level", () => {
    const model = parseDeliveryNoteSnapshot(validSource(), printContext);
    expect(model.snapshotVersion).toBe("delivery-note-snapshot-v1");
    expect(model.lines[0]).toMatchObject({
      itemCode: "ITEM-001",
      quantity: "2.0000",
      unitPrice: "10.00000",
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.lines)).toBe(true);
    expect(Object.isFrozen(model.lines[0])).toBe(true);
  });

  it.each([
    ["companySnapshot.code", (value: DeliveryNoteSnapshotSource) => (value.companySnapshot = {})],
    ["customerSnapshot.name", (value: DeliveryNoteSnapshotSource) => (value.customerSnapshot = { customerCode: "C1" })],
    ["deliverySnapshot.fullAddress", (value: DeliveryNoteSnapshotSource) => (value.deliverySnapshot = {})],
    ["lines", (value: DeliveryNoteSnapshotSource) => (value.lines = [])],
    ["lines[0].quantity", (value: DeliveryNoteSnapshotSource) => (value.lines[0]!.quantity = new Prisma.Decimal("0"))],
    ["totalAmount", (value: DeliveryNoteSnapshotSource) => (value.totalAmount = new Prisma.Decimal("99"))],
  ])("rejects invalid %s with a typed path", (path, mutate) => {
    const source = validSource();
    mutate(source);
    try {
      parseDeliveryNoteSnapshot(source, printContext);
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryNoteSnapshotValidationError);
      expect((error as DeliveryNoteSnapshotValidationError).details.path).toBe(path);
    }
  });

  it("rejects unsupported and blank versions without legacy fallback", () => {
    for (const version of ["delivery-note-snapshot-v0", ""]) {
      const source = validSource();
      source.snapshotVersion = version;
      expect(() => parseDeliveryNoteSnapshot(source, printContext)).toThrowError(
        expect.objectContaining({
          code: "DELIVERY_NOTE_SNAPSHOT_VERSION_UNSUPPORTED",
        }),
      );
    }
  });

  it("rejects duplicate line identity", () => {
    const source = validSource();
    source.lines.push({ ...source.lines[0]! });
    expect(() => parseDeliveryNoteSnapshot(source, printContext)).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({ path: "lines[1]" }),
      }),
    );
  });
});

describe("approved delivery-note font", () => {
  it("loads the pinned asset, manifest, license identity and glyph coverage", async () => {
    const loaded = await loadDeliveryNoteFont();
    expect(loaded.bytes.byteLength).toBe(DELIVERY_NOTE_FONT_MANIFEST.byteSize);
    expect(createHash("sha256").update(loaded.bytes).digest("hex")).toBe(
      DELIVERY_NOTE_FONT_MANIFEST.sha256,
    );
    expect(DELIVERY_NOTE_FONT_MANIFEST.license).toBe(
      "SIL Open Font License 1.1",
    );
    expect(DELIVERY_NOTE_REQUIRED_GLYPHS).toContain("銷貨單");
    expect(loaded.manifest.fontVersion).toContain("sans2.004");
  });

  it("fails fast when manifest integrity does not match", async () => {
    await expect(
      loadDeliveryNoteFont({
        ...DELIVERY_NOTE_FONT_MANIFEST,
        byteSize: 1,
      } as unknown as typeof DELIVERY_NOTE_FONT_MANIFEST),
    ).rejects.toBeInstanceOf(DeliveryNoteFontError);
  });
});

describe("deterministic delivery-note renderer", () => {
  it(
    "embeds Chinese and produces byte-identical PDF metadata and hash",
    async () => {
      const renderer = new DeterministicDeliveryNotePdfRenderer();
      const model = parseDeliveryNoteSnapshot(validSource(), printContext);
      const first = await renderer.render(model);
      const second = await renderer.render(model);
      expect(first.mimeType).toBe(DELIVERY_NOTE_PDF_MIME_TYPE);
      expect(first.rendererVersion).toBe(DELIVERY_NOTE_PDF_RENDERER_VERSION);
      expect(first.templateVersion).toBe(DELIVERY_NOTE_PDF_TEMPLATE_VERSION);
      expect(first.filename).toBe("DN-IN-202607-000001.pdf");
      expect(first.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(first.byteSize).toBe(first.bytes.byteLength);
      expect(first.sha256).toBe(
        createHash("sha256").update(first.bytes).digest("hex"),
      );
      expect(first.bytes.equals(second.bytes)).toBe(true);
      expect(first.sha256).toBe(second.sha256);
      const raw = first.bytes.toString("latin1");
      expect(raw).toContain("D:20000101000000Z");
      expect(raw).not.toContain(new Date().getUTCFullYear().toString());
    },
    60_000,
  );
});
