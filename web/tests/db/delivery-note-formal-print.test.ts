import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type { RequestContext } from "../../src/lib/auth/session";
import {
  DeliveryNoteFormalPrintMissingError,
  DeliveryNoteFormalPrintExistsError,
} from "../../src/lib/delivery-notes/errors";
import {
  formalPrintDeliveryNote,
  reprintDeliveryNote,
} from "../../src/lib/delivery-notes/formal-print";
import { DELIVERY_NOTE_FONT_MANIFEST } from "../../src/lib/delivery-notes/font";
import {
  DeterministicDeliveryNotePdfRenderer,
  type DeliveryNotePdfRenderer,
} from "../../src/lib/delivery-notes/renderer";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P3.3c delivery-note formal print transactions", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  let companyId: string;
  let userId: string;
  let sessionId: string;
  let customerId: string;
  let deliveryLocationId: string;
  let itemId: string;
  let freightRuleId: string;
  let context: RequestContext;
  let counter = 0;
  const documentCode = `${String.fromCharCode(
    65 + Number.parseInt(suffix[0]!, 16),
  )}${String.fromCharCode(65 + Number.parseInt(suffix[1]!, 16))}`;
  const serialBase = (Number.parseInt(suffix.slice(2), 16) % 800_000) + 100_000;

  beforeAll(async () => {
    const company = await db.company.create({
      data: { code: `P33C-${suffix}`, name: "P3.3c 測試公司" },
    });
    companyId = company.id;
    const user = await db.user.create({
      data: {
        username: `p33c-${suffix}`,
        normalizedUsername: `p33c-${suffix}`,
        passwordHash: "test",
        defaultCompanyId: companyId,
      },
    });
    userId = user.id;
    const session = await db.userSession.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        selectedCompanyId: companyId,
      },
    });
    sessionId = session.id;
    context = {
      actor: { userId, username: user.username },
      session: { sessionId },
      requestId: `p33c-${suffix}`,
      roleCodes: ["ORDER_ENTRY"],
      authorizedCompanies: [company],
      selectedCompany: company,
    };
    const customer = await db.customer.create({
      data: {
        customerType: "DOMESTIC",
        name: `P3.3c 客戶 ${suffix}`,
        taxId: `TAX-${suffix}`,
        normalizedTaxId: `TAX-${suffix}`,
        createdById: userId,
        updatedById: userId,
      },
    });
    customerId = customer.id;
    await db.customerCompany.create({
      data: {
        customerId,
        companyId,
        customerCode: `C-${suffix}`,
        normalizedCustomerCode: `C-${suffix}`.toUpperCase(),
        createdById: userId,
        updatedById: userId,
      },
    });
    const location = await db.deliveryLocation.create({
      data: {
        customerId,
        code: `LOC-${suffix}`,
        name: "測試送貨點",
        recipientName: "收貨人",
        phone: "02-12345678",
        addressLine: "送貨路一號",
        fullAddress: "臺北市測試區送貨路一號",
        createdById: userId,
        updatedById: userId,
      },
    });
    deliveryLocationId = location.id;
    const item = await db.item.create({
      data: {
        code: `P33C-ITEM-${suffix}`,
        normalizedCode: `P33C-ITEM-${suffix}`,
        name: "繁體中文測試品項",
        specification: "規格 A-1",
        baseUnit: "PCS",
        itemType: "PRODUCT",
        salesEnabled: true,
        createdById: userId,
        updatedById: userId,
      },
    });
    itemId = item.id;
    await db.itemCompany.create({
      data: {
        itemId,
        companyId,
        companyItemCode: `IC-${suffix}`,
        normalizedCompanyItemCode: `IC-${suffix}`.toUpperCase(),
        salesEnabled: true,
        createdById: userId,
        updatedById: userId,
      },
    });
    const freightRule = await db.freightRule.create({
      data: {
        customerId,
        companyId,
        deliveryLocationId,
        mode: "FIXED_PER_LOCATION",
        fixedFreight: "5",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdById: userId,
        updatedById: userId,
      },
    });
    freightRuleId = freightRule.id;
  });

  afterAll(async () => db.$disconnect());

  async function createActiveNote() {
    counter += 1;
    const serial = String(serialBase + counter).padStart(6, "0");
    const order = await db.salesOrder.create({
      data: {
        companyId,
        fiscalYear: 2026,
        fiscalMonth: 7,
        orderNumber: `SO-${documentCode}-202607-${serial}`,
        orderDate: new Date("2026-07-28T00:00:00.000Z"),
        customerId,
        deliveryLocationId,
        status: "DELIVERY_CREATED",
        revisionNo: 1,
        customerSnapshot: {
          customerCode: `C-${suffix}`,
          name: "繁體中文測試客戶",
          taxId: "12345678",
        },
        customerCompanySnapshot: {
          companyId,
          customerCode: `C-${suffix}`,
        },
        deliverySnapshot: {
          name: "測試送貨點",
          fullAddress: "臺北市測試區送貨路一號",
          recipientName: "收貨人",
          phone: "02-12345678",
        },
        companySnapshot: {
          code: `P33C-${suffix}`,
          companyName: "P3.3c 測試公司",
          companyTaxId: "87654321",
          companyAddress: "臺北市公司路一號",
          companyPhone: "02-87654321",
        },
        paymentTermsText: "月結 30 天",
        freightRuleId,
        freightMode: "FIXED_PER_LOCATION",
        freightSnapshot: { mode: "FIXED_PER_LOCATION", freightAmount: "5" },
        subtotal: "20",
        freightAmount: "5",
        totalAmount: "25",
        confirmedAt: new Date("2026-07-28T01:00:00.000Z"),
        confirmedById: userId,
        createdById: userId,
        updatedById: userId,
      },
    });
    const orderLine = await db.salesOrderLine.create({
      data: {
        salesOrderId: order.id,
        companyId,
        lineNumber: 1,
        itemId,
        itemSnapshot: {
          code: `P33C-ITEM-${suffix}`,
          companyItemCode: `IC-${suffix}`,
          name: "繁體中文測試品項",
          specification: "規格 A-1",
          baseUnit: "PCS",
        },
        priceSnapshot: {
          priceSource: "MANUAL",
          transactionUnitPrice: "10.00000",
        },
        quantity: "2.0000",
        unitPrice: "10.00000",
        priceSource: "MANUAL",
        manualPriceReason: "測試",
        priceOverriddenAt: new Date("2026-07-28T01:00:00.000Z"),
        priceOverriddenById: userId,
        lineAmount: "20",
        createdById: userId,
        updatedById: userId,
      },
    });
    const note = await db.deliveryNote.create({
      data: {
        companyId,
        deliveryNoteNumber: `DN-${documentCode}-202607-${serial}`,
        deliveryNoteDate: new Date("2026-07-28T00:00:00.000Z"),
        fiscalYear: 2026,
        fiscalMonth: 7,
        salesOrderId: order.id,
        salesOrderRevisionNo: 1,
        status: "ACTIVE",
        companySnapshot: order.companySnapshot as Prisma.InputJsonValue,
        customerSnapshot: order.customerSnapshot as Prisma.InputJsonValue,
        customerCompanySnapshot:
          order.customerCompanySnapshot as Prisma.InputJsonValue,
        contactSnapshot: order.contactSnapshot ?? undefined,
        deliverySnapshot: order.deliverySnapshot as Prisma.InputJsonValue,
        paymentTermsText: order.paymentTermsText,
        freightSnapshot: order.freightSnapshot as Prisma.InputJsonValue,
        snapshotVersion: "delivery-note-snapshot-v1",
        subtotal: "20",
        freightAmount: "5",
        totalAmount: "25",
        createdById: userId,
        updatedById: userId,
      },
    });
    await db.deliveryNoteLine.create({
      data: {
        deliveryNoteId: note.id,
        companyId,
        lineNumber: 1,
        salesOrderLineId: orderLine.id,
        itemId,
        itemSnapshot: orderLine.itemSnapshot as Prisma.InputJsonValue,
        priceSnapshot: orderLine.priceSnapshot as Prisma.InputJsonValue,
        quantity: "2.0000",
        unitPrice: "10.00000",
        lineAmount: "20",
        createdById: userId,
      },
    });
    return { note, order };
  }

  function fakeRenderer(bytes = Buffer.from("%PDF-1.7\nP3.3c deterministic\n")) {
    const render = vi.fn<DeliveryNotePdfRenderer["render"]>(async (model) => ({
      bytes,
      mimeType: "application/pdf",
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      filename: `${model.deliveryNoteNumber}.pdf`,
      documentVersion: 1,
      rendererVersion: "delivery-note-pdf-renderer-v1",
      templateVersion: "delivery-note-pdf-template-v1",
      fontVersion: DELIVERY_NOTE_FONT_MANIFEST.fontVersion,
      snapshotVersion: model.snapshotVersion,
    }));
    return { renderer: { render }, render };
  }

  it("atomically persists bytes, events, both state transitions, date, audit and idempotency", async () => {
    const { note, order } = await createActiveNote();
    const fake = fakeRenderer();
    const now = new Date("2026-07-31T16:30:00.000Z");
    const key = randomUUID();
    const first = await formalPrintDeliveryNote(
      db,
      { context, companyId, deliveryNoteId: note.id, idempotencyKey: key, now },
      { renderer: fake.renderer },
    );
    const replay = await formalPrintDeliveryNote(
      db,
      { context, companyId, deliveryNoteId: note.id, idempotencyKey: key, now },
      { renderer: fake.renderer },
    );
    expect(first.actualDeliveryDate).toBe("2026-08-01");
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.printVersionId).toBe(first.printVersionId);
    expect(replay.printEventId).toBe(first.printEventId);
    expect(fake.render).toHaveBeenCalledTimes(1);
    const [storedNote, storedOrder, version, events, audits, idempotency] =
      await Promise.all([
        db.deliveryNote.findUniqueOrThrow({ where: { id: note.id } }),
        db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
        db.deliveryNotePrintVersion.findUniqueOrThrow({
          where: { id: first.printVersionId },
        }),
        db.deliveryNotePrintEvent.findMany({
          where: { deliveryNoteId: note.id },
        }),
        db.auditLog.findMany({
          where: { entityId: note.id, operation: "delivery_note.formal_print" },
        }),
        db.idempotencyKey.findUniqueOrThrow({
          where: {
            companyId_operation_idempotencyKey: {
              companyId,
              operation: "delivery_note.formal_print",
              idempotencyKey: key,
            },
          },
        }),
      ]);
    expect(storedNote).toMatchObject({
      status: "SHIPPED",
      firstPrintedById: userId,
      reprintCount: 0,
    });
    expect(storedOrder.status).toBe("SHIPPED");
    expect(Buffer.from(version.pdfBytes).equals(Buffer.from("%PDF-1.7\nP3.3c deterministic\n"))).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("FORMAL_PRINT");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).not.toHaveProperty("pdfBytes");
    expect(idempotency.status).toBe("COMPLETED");
  });

  it("rolls every business row back when rendering fails", async () => {
    const { note, order } = await createActiveNote();
    const renderer: DeliveryNotePdfRenderer = {
      render: vi.fn(async () => {
        throw new Error("injected renderer failure");
      }),
    };
    await expect(
      formalPrintDeliveryNote(
        db,
        {
          context,
          companyId,
          deliveryNoteId: note.id,
          idempotencyKey: randomUUID(),
        },
        { renderer },
      ),
    ).rejects.toThrow("PDF 產生失敗");
    const [storedNote, storedOrder, versions, events, audits] = await Promise.all([
      db.deliveryNote.findUniqueOrThrow({ where: { id: note.id } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
      db.deliveryNotePrintVersion.count({ where: { deliveryNoteId: note.id } }),
      db.deliveryNotePrintEvent.count({ where: { deliveryNoteId: note.id } }),
      db.auditLog.count({
        where: { entityId: note.id, operation: "delivery_note.formal_print" },
      }),
    ]);
    expect(storedNote.status).toBe("ACTIVE");
    expect(storedOrder.status).toBe("DELIVERY_CREATED");
    expect([versions, events, audits]).toEqual([0, 0, 0]);
  });

  it("rolls PDF, event and both state transitions back when audit fails", async () => {
    const { note, order } = await createActiveNote();
    await expect(
      formalPrintDeliveryNote(
        db,
        {
          context,
          companyId,
          deliveryNoteId: note.id,
          idempotencyKey: randomUUID(),
        },
        {
          renderer: fakeRenderer().renderer,
          auditWriter: vi.fn(async () => {
            throw new Error("injected audit failure");
          }),
        },
      ),
    ).rejects.toThrow("injected audit failure");
    const [storedNote, storedOrder, versions, events, audits] = await Promise.all([
      db.deliveryNote.findUniqueOrThrow({ where: { id: note.id } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: order.id } }),
      db.deliveryNotePrintVersion.count({ where: { deliveryNoteId: note.id } }),
      db.deliveryNotePrintEvent.count({ where: { deliveryNoteId: note.id } }),
      db.auditLog.count({
        where: { entityId: note.id, operation: "delivery_note.formal_print" },
      }),
    ]);
    expect(storedNote.status).toBe("ACTIVE");
    expect(storedOrder.status).toBe("DELIVERY_CREATED");
    expect([versions, events, audits]).toEqual([0, 0, 0]);
  });

  it("converges different-key concurrent first prints to one formal result", async () => {
    const { note } = await createActiveNote();
    const fake = fakeRenderer();
    const settled = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((idempotencyKey) =>
        formalPrintDeliveryNote(
          db,
          { context, companyId, deliveryNoteId: note.id, idempotencyKey },
          { renderer: fake.renderer },
        ),
      ),
    );
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.deliveryNotePrintVersion.count({ where: { deliveryNoteId: note.id } })).toBe(1);
    expect(await db.deliveryNotePrintEvent.count({
      where: { deliveryNoteId: note.id, eventType: "FORMAL_PRINT" },
    })).toBe(1);
  });

  it("reuses immutable PDF, never renders, and keeps event/count concurrency consistent", async () => {
    const { note } = await createActiveNote();
    const fake = fakeRenderer();
    const formal = await formalPrintDeliveryNote(
      db,
      {
        context,
        companyId,
        deliveryNoteId: note.id,
        idempotencyKey: randomUUID(),
      },
      { renderer: fake.renderer },
    );
    const immutableBefore = await db.deliveryNote.findUniqueOrThrow({
      where: { id: note.id },
    });
    const sameKey = randomUUID();
    const first = await reprintDeliveryNote(db, {
      context,
      companyId,
      deliveryNoteId: note.id,
      idempotencyKey: sameKey,
    });
    const replay = await reprintDeliveryNote(db, {
      context,
      companyId,
      deliveryNoteId: note.id,
      idempotencyKey: sameKey,
    });
    const concurrent = await Promise.all(
      [randomUUID(), randomUUID()].map((idempotencyKey) =>
        reprintDeliveryNote(db, {
          context,
          companyId,
          deliveryNoteId: note.id,
          idempotencyKey,
        }),
      ),
    );
    const immutableAfter = await db.deliveryNote.findUniqueOrThrow({
      where: { id: note.id },
    });
    expect(first.printVersionId).toBe(formal.printVersionId);
    expect(replay.printEventId).toBe(first.printEventId);
    expect(concurrent.every((value) => value.printVersionId === formal.printVersionId)).toBe(true);
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(immutableAfter.reprintCount).toBe(3);
    expect(await db.deliveryNotePrintEvent.count({
      where: { deliveryNoteId: note.id, eventType: "REPRINT" },
    })).toBe(3);
    expect(immutableAfter.actualDeliveryDate).toEqual(immutableBefore.actualDeliveryDate);
    expect(immutableAfter.firstPrintedAt).toEqual(immutableBefore.firstPrintedAt);
    expect(immutableAfter.firstPrintedById).toBe(immutableBefore.firstPrintedById);
  });

  it("rejects reprint without a formal version and enforces append-only storage", async () => {
    const { note } = await createActiveNote();
    await db.deliveryNote.update({
      where: { id: note.id },
      data: {
        status: "SHIPPED",
        actualDeliveryDate: new Date("2026-07-28T00:00:00.000Z"),
        firstPrintedAt: new Date("2026-07-28T01:00:00.000Z"),
        firstPrintedById: userId,
      },
    });
    await db.salesOrder.update({
      where: { id: note.salesOrderId },
      data: { status: "SHIPPED" },
    });
    await expect(
      reprintDeliveryNote(db, {
        context,
        companyId,
        deliveryNoteId: note.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(DeliveryNoteFormalPrintMissingError);

    const another = await createActiveNote();
    const formal = await formalPrintDeliveryNote(
      db,
      {
        context,
        companyId,
        deliveryNoteId: another.note.id,
        idempotencyKey: randomUUID(),
      },
      { renderer: fakeRenderer().renderer },
    );
    await expect(
      db.deliveryNotePrintVersion.update({
        where: { id: formal.printVersionId },
        data: { filename: "changed.pdf" },
      }),
    ).rejects.toThrow("append-only");
    await expect(
      formalPrintDeliveryNote(
        db,
        {
          context,
          companyId,
          deliveryNoteId: another.note.id,
          idempotencyKey: randomUUID(),
        },
        { renderer: fakeRenderer().renderer },
      ),
    ).rejects.toBeInstanceOf(DeliveryNoteFormalPrintExistsError);
  });

  it(
    "persists one real renderer PDF whose DB bytes match its checksum",
    async () => {
      const { note } = await createActiveNote();
      const result = await formalPrintDeliveryNote(
        db,
        {
          context,
          companyId,
          deliveryNoteId: note.id,
          idempotencyKey: randomUUID(),
          now: new Date("2026-07-28T05:00:00.000Z"),
        },
        { renderer: new DeterministicDeliveryNotePdfRenderer() },
      );
      const version = await db.deliveryNotePrintVersion.findUniqueOrThrow({
        where: { id: result.printVersionId },
      });
      expect(Buffer.from(version.pdfBytes).subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(createHash("sha256").update(version.pdfBytes).digest("hex")).toBe(version.contentHash);
      expect(version.byteSize).toBe(version.pdfBytes.byteLength);
    },
    60_000,
  );
});
