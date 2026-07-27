import type {
  DeliveryNoteStatus,
  DeliveryNoteVoidSource,
  Prisma,
} from "@/generated/prisma/client";
import type { RequestContext } from "@/lib/auth/session";

export type DeliveryNoteSnapshot = Record<string, Prisma.JsonValue>;

export type DeliveryNoteLineDetail = {
  id: string;
  lineNumber: number;
  salesOrderLineId: string;
  itemId: string;
  itemSnapshot: Prisma.JsonValue;
  priceSnapshot: Prisma.JsonValue;
  quantity: string;
  unitPrice: string;
  lineAmount: string;
};

export type DeliveryNoteReferenceSummary = {
  id: string;
  deliveryNoteNumber: string;
  deliveryNoteDate: string;
  salesOrderRevisionNo: number;
  status: DeliveryNoteStatus;
};

export type DeliveryNoteActorSummary = {
  id: string;
  username: string;
};

export type DeliveryNoteSummary = {
  id: string;
  companyId: string;
  deliveryNoteNumber: string;
  deliveryNoteDate: string;
  fiscalYear: number;
  fiscalMonth: number;
  salesOrderId: string;
  salesOrderNumber: string;
  salesOrderRevisionNo: number;
  status: DeliveryNoteStatus;
  customerName: string | null;
  subtotal: string;
  freightAmount: string;
  totalAmount: string;
  voidSource: DeliveryNoteVoidSource | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type DeliveryNoteDetail = DeliveryNoteSummary & {
  companySnapshot: Prisma.JsonValue;
  customerSnapshot: Prisma.JsonValue;
  customerCompanySnapshot: Prisma.JsonValue;
  contactSnapshot: Prisma.JsonValue | null;
  deliverySnapshot: Prisma.JsonValue;
  paymentTermsText: string | null;
  freightSnapshot: Prisma.JsonValue;
  createdById: string;
  createdBy: DeliveryNoteActorSummary;
  replacedDeliveryNoteId: string | null;
  replacementDeliveryNoteId: string | null;
  replacedDeliveryNote: DeliveryNoteReferenceSummary | null;
  replacementDeliveryNote: DeliveryNoteReferenceSummary | null;
  voidedById: string | null;
  voidedBy: DeliveryNoteActorSummary | null;
  lines: DeliveryNoteLineDetail[];
};

export type CreateDeliveryNoteInput = {
  context: RequestContext;
  companyId: string;
  salesOrderId: string;
  expectedRevisionNo: number;
  idempotencyKey: string;
  now?: Date;
};

export type CreateDeliveryNoteResult = {
  deliveryNote: DeliveryNoteDetail;
  replayed: boolean;
};

export type RebuildDeliveryNoteInput = {
  context: RequestContext;
  companyId: string;
  salesOrderId: string;
  expectedRevisionNo: number;
  idempotencyKey: string;
  reason: string;
  now?: Date;
};

export type RebuildDeliveryNoteResult = CreateDeliveryNoteResult;

export type AdminVoidDeliveryNoteInput = {
  context: RequestContext;
  companyId: string;
  deliveryNoteId: string;
  voidReason: string;
  idempotencyKey: string;
  now?: Date;
};

export type AdminVoidDeliveryNoteResult = {
  deliveryNote: DeliveryNoteDetail;
  replayed: boolean;
};

export type DeliveryNoteListFilters = {
  status?: DeliveryNoteStatus | "ALL";
  salesOrderId?: string;
  deliveryNoteNumber?: string;
  deliveryNoteDateFrom?: string;
  deliveryNoteDateTo?: string;
  customerKeyword?: string;
  page?: number;
  pageSize?: number;
};

export type DeliveryNoteListResult = {
  deliveryNotes: DeliveryNoteSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CurrentDeliveryNoteResult = DeliveryNoteDetail | null;
