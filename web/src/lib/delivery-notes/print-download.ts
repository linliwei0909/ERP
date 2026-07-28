import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { hasCompanyAccess } from "@/lib/auth/company-scope";
import { hasPermission } from "@/lib/auth/rbac";
import type { RequestContext } from "@/lib/auth/session";
import {
  DeliveryNoteAccessDeniedError,
  DeliveryNoteFormalPrintMissingError,
  DeliveryNoteNotFoundError,
  DeliveryNotePdfRenderError,
} from "@/lib/delivery-notes/errors";

export type DeliveryNotePdfDownload = {
  bytes: Uint8Array;
  byteSize: number;
  contentHash: string;
  mimeType: "application/pdf";
  filename: string;
};

function assertDownloadAccess(
  context: RequestContext,
  companyId: string,
): void {
  if (
    !hasCompanyAccess(
      context.authorizedCompanies.map((company) => company.id),
      companyId,
    ) ||
    !hasPermission(context.roleCodes, "delivery_notes.read")
  ) {
    throw new DeliveryNoteAccessDeniedError();
  }
}

export async function getDeliveryNotePdfDownload(
  db: PrismaClient,
  input: {
    context: RequestContext;
    companyId: string;
    deliveryNoteId: string;
  },
): Promise<DeliveryNotePdfDownload> {
  assertDownloadAccess(input.context, input.companyId);
  const note = await db.deliveryNote.findFirst({
    where: {
      id: input.deliveryNoteId,
      companyId: input.companyId,
    },
    select: {
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
    },
  });
  if (!note) throw new DeliveryNoteNotFoundError();
  const version = note.printVersions[0];
  if (!version) throw new DeliveryNoteFormalPrintMissingError();

  const bytes = new Uint8Array(version.pdfBytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (
    version.mimeType !== "application/pdf" ||
    version.byteSize !== bytes.byteLength ||
    bytes.byteLength < 5 ||
    new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-" ||
    hash !== version.contentHash
  ) {
    throw new DeliveryNotePdfRenderError(
      "DELIVERY_NOTE_PRINT_STORAGE_INVALID",
      "正式 PDF 儲存完整性驗證失敗",
    );
  }
  return {
    bytes,
    byteSize: version.byteSize,
    contentHash: version.contentHash,
    mimeType: "application/pdf",
    filename: version.filename,
  };
}

function asciiFilenameFallback(filename: string): string {
  const safe = filename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  return safe || "delivery-note.pdf";
}

function rfc5987Filename(filename: string): string {
  return encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function deliveryNotePdfContentDisposition(filename: string): string {
  const normalized = filename.replace(/[\r\n]/g, "").trim();
  const fallback = asciiFilenameFallback(normalized);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${rfc5987Filename(
    normalized || fallback,
  )}`;
}

export function deliveryNotePdfResponse(
  download: DeliveryNotePdfDownload,
  correlationId: string,
): Response {
  const body = new ArrayBuffer(download.bytes.byteLength);
  new Uint8Array(body).set(download.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": download.mimeType,
      "content-length": String(download.byteSize),
      "content-disposition": deliveryNotePdfContentDisposition(
        download.filename,
      ),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-request-id": correlationId,
    },
  });
}
