import type { Prisma } from "@/generated/prisma/client";
import {
  DeliveryNoteSnapshotValidationError,
} from "@/lib/delivery-notes/errors";
import { DELIVERY_NOTE_SNAPSHOT_VERSION } from "@/lib/delivery-notes/snapshots";
import { formatDateOnly } from "@/lib/delivery-notes/validation";

export type DeliveryNotePrintLine = Readonly<{
  id: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  companyItemCode: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
}>;

export type DeliveryNotePrintModel = Readonly<{
  snapshotVersion: typeof DELIVERY_NOTE_SNAPSHOT_VERSION;
  deliveryNoteId: string;
  deliveryNoteNumber: string;
  deliveryNoteDate: string;
  actualDeliveryDate: string;
  formalPrintedAt: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  companyTaxId: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerTaxId: string | null;
  deliveryAddress: string;
  deliveryLocationName: string;
  recipientName: string | null;
  recipientPhone: string | null;
  contactName: string | null;
  contactPhone: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  salesOrderRevisionNo: number;
  currency: "TWD";
  paymentTerms: string | null;
  subtotal: string;
  freightAmount: string;
  totalAmount: string;
  taxDisplay: "未分列";
  remarks: null;
  lines: readonly DeliveryNotePrintLine[];
}>;

export type DeliveryNoteSnapshotSource = {
  id: string;
  companyId: string;
  deliveryNoteNumber: string;
  deliveryNoteDate: Date;
  salesOrderId: string;
  snapshotVersion: string;
  companySnapshot: Prisma.JsonValue;
  customerSnapshot: Prisma.JsonValue;
  customerCompanySnapshot: Prisma.JsonValue;
  contactSnapshot: Prisma.JsonValue | null;
  deliverySnapshot: Prisma.JsonValue;
  paymentTermsText: string | null;
  salesOrderRevisionNo: number;
  subtotal: { toFixed(digits: number): string };
  freightAmount: { toFixed(digits: number): string };
  totalAmount: { toFixed(digits: number): string };
  salesOrder: {
    id: string;
    companyId: string;
    orderNumber: string;
    customerId: string;
  };
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    itemSnapshot: Prisma.JsonValue;
    quantity: { toFixed(digits: number): string; greaterThan(value: number): boolean };
    unitPrice: { toFixed(digits: number): string };
    lineAmount: { toFixed(digits: number): string };
  }>;
};

function fail(
  source: Pick<DeliveryNoteSnapshotSource, "id" | "snapshotVersion">,
  path: string,
  reason: string,
  code?: "DELIVERY_NOTE_SNAPSHOT_VERSION_UNSUPPORTED",
): never {
  throw new DeliveryNoteSnapshotValidationError({
    deliveryNoteId: source.id,
    snapshotVersion: source.snapshotVersion,
    path,
    reason,
    code,
  });
}

function object(
  source: Pick<DeliveryNoteSnapshotSource, "id" | "snapshotVersion">,
  value: Prisma.JsonValue,
  path: string,
): Record<string, Prisma.JsonValue | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(source, path, "必須為物件");
  }
  return value;
}

function requiredString(
  source: Pick<DeliveryNoteSnapshotSource, "id" | "snapshotVersion">,
  value: Prisma.JsonValue | undefined,
  path: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fail(source, path, "必須為非空白字串");
  }
  return value;
}

function optionalString(
  source: Pick<DeliveryNoteSnapshotSource, "id" | "snapshotVersion">,
  value: Prisma.JsonValue | undefined,
  path: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return fail(source, path, "必須為字串或 null");
  return value.trim() === "" ? null : value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function parseDeliveryNoteSnapshot(
  source: DeliveryNoteSnapshotSource,
  printContext: {
    actualDeliveryDate: Date;
    formalPrintedAt: Date;
  },
): DeliveryNotePrintModel {
  if (source.snapshotVersion !== DELIVERY_NOTE_SNAPSHOT_VERSION) {
    fail(
      source,
      "snapshotVersion",
      `不支援版本 ${source.snapshotVersion || "(blank)"}`,
      "DELIVERY_NOTE_SNAPSHOT_VERSION_UNSUPPORTED",
    );
  }
  if (
    source.salesOrder.id !== source.salesOrderId ||
    source.salesOrder.companyId !== source.companyId
  ) {
    fail(source, "salesOrder", "銷貨單、訂單與公司 identity 不一致");
  }
  if (source.lines.length === 0) fail(source, "lines", "至少需要一筆明細");

  const company = object(source, source.companySnapshot, "companySnapshot");
  const customer = object(source, source.customerSnapshot, "customerSnapshot");
  const customerCompany = object(
    source,
    source.customerCompanySnapshot,
    "customerCompanySnapshot",
  );
  const delivery = object(source, source.deliverySnapshot, "deliverySnapshot");
  const contact =
    source.contactSnapshot === null
      ? null
      : object(source, source.contactSnapshot, "contactSnapshot");
  const snapshotCompanyId = optionalString(
    source,
    customerCompany.companyId,
    "customerCompanySnapshot.companyId",
  );
  if (snapshotCompanyId && snapshotCompanyId !== source.companyId) {
    fail(source, "customerCompanySnapshot.companyId", "與銷貨單公司不一致");
  }

  const seenLineIds = new Set<string>();
  const seenLineNumbers = new Set<number>();
  const lines = source.lines.map((line, index): DeliveryNotePrintLine => {
    const path = `lines[${index}]`;
    if (seenLineIds.has(line.id) || seenLineNumbers.has(line.lineNumber)) {
      fail(source, path, "line identity 必須唯一");
    }
    seenLineIds.add(line.id);
    seenLineNumbers.add(line.lineNumber);
    if (!Number.isInteger(line.lineNumber) || line.lineNumber < 1) {
      fail(source, `${path}.lineNumber`, "必須為大於零的整數");
    }
    if (!line.quantity.greaterThan(0)) {
      fail(source, `${path}.quantity`, "必須大於零");
    }
    const item = object(source, line.itemSnapshot, `${path}.itemSnapshot`);
    const name = requiredString(source, item.name, `${path}.itemSnapshot.name`);
    const specification = optionalString(
      source,
      item.specification,
      `${path}.itemSnapshot.specification`,
    );
    return {
      id: line.id,
      lineNumber: line.lineNumber,
      itemId: line.itemId,
      itemCode: requiredString(
        source,
        item.code,
        `${path}.itemSnapshot.code`,
      ),
      companyItemCode: requiredString(
        source,
        item.companyItemCode,
        `${path}.itemSnapshot.companyItemCode`,
      ),
      description: specification ? `${name} ${specification}` : name,
      quantity: line.quantity.toFixed(4),
      unit: requiredString(
        source,
        item.baseUnit,
        `${path}.itemSnapshot.baseUnit`,
      ),
      unitPrice: line.unitPrice.toFixed(5),
      amount: line.lineAmount.toFixed(0),
    };
  });

  const subtotal = source.subtotal.toFixed(0);
  const lineSum = source.lines.reduce(
    (sum, line) => sum + BigInt(line.lineAmount.toFixed(0)),
    BigInt(0),
  );
  if (lineSum !== BigInt(subtotal)) {
    fail(source, "subtotal", "與明細金額合計不一致");
  }
  const freightAmount = source.freightAmount.toFixed(0);
  const totalAmount = source.totalAmount.toFixed(0);
  if (BigInt(subtotal) + BigInt(freightAmount) !== BigInt(totalAmount)) {
    fail(source, "totalAmount", "必須等於小計加運費");
  }

  return deepFreeze({
    snapshotVersion: DELIVERY_NOTE_SNAPSHOT_VERSION,
    deliveryNoteId: source.id,
    deliveryNoteNumber: requiredString(
      source,
      source.deliveryNoteNumber,
      "deliveryNoteNumber",
    ),
    deliveryNoteDate: formatDateOnly(source.deliveryNoteDate),
    actualDeliveryDate: formatDateOnly(printContext.actualDeliveryDate),
    formalPrintedAt: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(printContext.formalPrintedAt),
    companyId: source.companyId,
    companyCode: requiredString(source, company.code, "companySnapshot.code"),
    companyName: requiredString(
      source,
      company.companyName,
      "companySnapshot.companyName",
    ),
    companyTaxId: optionalString(
      source,
      company.companyTaxId,
      "companySnapshot.companyTaxId",
    ),
    companyAddress: optionalString(
      source,
      company.companyAddress,
      "companySnapshot.companyAddress",
    ),
    companyPhone: optionalString(
      source,
      company.companyPhone,
      "companySnapshot.companyPhone",
    ),
    customerId: source.salesOrder.customerId,
    customerCode: requiredString(
      source,
      customer.customerCode ?? customerCompany.customerCode,
      "customerSnapshot.customerCode",
    ),
    customerName: requiredString(
      source,
      customer.name,
      "customerSnapshot.name",
    ),
    customerTaxId: optionalString(
      source,
      customer.taxId,
      "customerSnapshot.taxId",
    ),
    deliveryAddress: requiredString(
      source,
      delivery.fullAddress,
      "deliverySnapshot.fullAddress",
    ),
    deliveryLocationName: requiredString(
      source,
      delivery.name,
      "deliverySnapshot.name",
    ),
    recipientName: optionalString(
      source,
      delivery.recipientName,
      "deliverySnapshot.recipientName",
    ),
    recipientPhone: optionalString(
      source,
      delivery.phone,
      "deliverySnapshot.phone",
    ),
    contactName: contact
      ? optionalString(source, contact.name, "contactSnapshot.name")
      : null,
    contactPhone: contact
      ? optionalString(
          source,
          contact.phone ?? contact.mobile,
          "contactSnapshot.phone",
        )
      : null,
    salesOrderId: source.salesOrderId,
    salesOrderNumber: requiredString(
      source,
      source.salesOrder.orderNumber,
      "salesOrder.orderNumber",
    ),
    salesOrderRevisionNo: source.salesOrderRevisionNo,
    currency: "TWD",
    paymentTerms: source.paymentTermsText?.trim() || null,
    subtotal,
    freightAmount,
    totalAmount,
    taxDisplay: "未分列",
    remarks: null,
    lines,
  });
}
