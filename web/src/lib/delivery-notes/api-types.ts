import type {
  DeliveryNoteActorSummary,
  DeliveryNoteDetail,
  DeliveryNoteLineDetail,
  DeliveryNoteReferenceSummary,
  DeliveryNoteSummary,
} from "@/lib/delivery-notes/types";

export type DeliveryNoteSummaryDto = Omit<
  DeliveryNoteSummary,
  "customerName"
> & {
  customer: {
    name: string | null;
  };
};

export type DeliveryNoteLineDto = DeliveryNoteLineDetail;

export type DeliveryNoteReferenceDto = DeliveryNoteReferenceSummary;

export type DeliveryNoteActorDto = DeliveryNoteActorSummary;

export type DeliveryNoteDetailDto = Omit<
  DeliveryNoteDetail,
  "customerName" | "lines" | "replacedDeliveryNote" | "replacementDeliveryNote" | "voidedBy"
> & {
  customer: {
    name: string | null;
  };
  lines: DeliveryNoteLineDto[];
  replacedDeliveryNote: DeliveryNoteReferenceDto | null;
  replacementDeliveryNote: DeliveryNoteReferenceDto | null;
  voidedBy: DeliveryNoteActorDto | null;
};

export type DeliveryNoteMutationResponseDto = {
  deliveryNote: DeliveryNoteDetailDto;
  replayed: boolean;
  correlationId: string;
};

export type DeliveryNoteCurrentResponseDto = {
  deliveryNote: DeliveryNoteDetailDto | null;
  correlationId: string;
};

export type DeliveryNoteListResponseDto = {
  items: DeliveryNoteSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  correlationId: string;
};

export type DeliveryNoteDetailResponseDto = {
  deliveryNote: DeliveryNoteDetailDto;
  correlationId: string;
};
