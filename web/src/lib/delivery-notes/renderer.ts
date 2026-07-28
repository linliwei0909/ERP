import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import { DeliveryNotePdfRenderError } from "@/lib/delivery-notes/errors";
import {
  assertDeliveryNoteTextGlyphs,
  loadDeliveryNoteFont,
  type LoadedDeliveryNoteFont,
} from "@/lib/delivery-notes/font";
import type { DeliveryNotePrintModel } from "@/lib/delivery-notes/print-model";

export const DELIVERY_NOTE_PDF_RENDERER_VERSION =
  "delivery-note-pdf-renderer-v1" as const;
export const DELIVERY_NOTE_PDF_TEMPLATE_VERSION =
  "delivery-note-pdf-template-v1" as const;
export const DELIVERY_NOTE_DOCUMENT_VERSION = 1 as const;
export const DELIVERY_NOTE_PDF_MIME_TYPE = "application/pdf" as const;

const FIXED_PDF_DATE = new Date("2000-01-01T00:00:00.000Z");
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;

export type RenderedDeliveryNotePdf = Readonly<{
  bytes: Buffer;
  mimeType: typeof DELIVERY_NOTE_PDF_MIME_TYPE;
  byteSize: number;
  sha256: string;
  filename: string;
  documentVersion: typeof DELIVERY_NOTE_DOCUMENT_VERSION;
  rendererVersion: typeof DELIVERY_NOTE_PDF_RENDERER_VERSION;
  templateVersion: typeof DELIVERY_NOTE_PDF_TEMPLATE_VERSION;
  fontVersion: string;
  snapshotVersion: string;
}>;

export interface DeliveryNotePdfRenderer {
  render(model: DeliveryNotePrintModel): Promise<RenderedDeliveryNotePdf>;
}

function safeFilename(number: string): string {
  const normalized = number.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new DeliveryNotePdfRenderError(
      "DELIVERY_NOTE_PDF_INVALID",
      "銷貨單號無法形成安全檔名",
    );
  }
  return `${normalized}.pdf`;
}

function formatMoney(value: string): string {
  return BigInt(value).toLocaleString("en-US");
}

function collectText(model: DeliveryNotePrintModel): string {
  return [
    model.companyName,
    model.companyCode,
    model.companyTaxId,
    model.companyAddress,
    model.companyPhone,
    model.customerCode,
    model.customerName,
    model.customerTaxId,
    model.deliveryAddress,
    model.deliveryLocationName,
    model.recipientName,
    model.recipientPhone,
    model.contactName,
    model.contactPhone,
    model.salesOrderNumber,
    String(model.salesOrderRevisionNo),
    model.deliveryNoteNumber,
    model.actualDeliveryDate,
    model.formalPrintedAt,
    model.paymentTerms,
    ...model.lines.flatMap((line) => [
      line.itemCode,
      line.companyItemCode,
      line.description,
      line.quantity,
      line.unit,
      line.unitPrice,
      line.amount,
    ]),
  ]
    .filter((value): value is string => value !== null)
    .join("\n");
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  model: DeliveryNotePrintModel,
): number {
  page.drawText(model.companyName, {
    x: MARGIN,
    y: PAGE_HEIGHT - 54,
    size: 18,
    font,
  });
  page.drawText("銷 貨 單", {
    x: PAGE_WIDTH - 150,
    y: PAGE_HEIGHT - 54,
    size: 20,
    font,
  });
  const details = [
    `銷貨單號：${model.deliveryNoteNumber}`,
    `銷貨日期：${model.deliveryNoteDate}　實際出貨日：${model.actualDeliveryDate}`,
    `訂單號碼：${model.salesOrderNumber}　版次：${model.salesOrderRevisionNo}`,
    `客戶：${model.customerCode} ${model.customerName}`,
    `送貨：${model.deliveryLocationName} ${model.deliveryAddress}`,
    `收件人：${model.recipientName ?? "—"}　電話：${
      model.recipientPhone ?? "—"
    }　聯絡人：${model.contactName ?? "—"} ${
      model.contactPhone ?? "—"
    }`,
    `正式列印時間：${model.formalPrintedAt} Asia/Taipei`,
  ];
  details.forEach((text, index) =>
    page.drawText(text, {
      x: MARGIN,
      y: PAGE_HEIGHT - 82 - index * 15,
      size: 9,
      font,
    }),
  );
  const y = PAGE_HEIGHT - 202;
  page.drawRectangle({
    x: MARGIN,
    y,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
  });
  ["項次", "品號／品名規格", "數量", "單位", "單價", "金額"].forEach(
    (text, index) =>
      page.drawText(text, {
        x: [MARGIN + 4, 82, 337, 390, 432, 505][index],
        y: y + 6,
        size: 9,
        font,
      }),
  );
  return y - 18;
}

function drawFooter(page: PDFPage, font: PDFFont, model: DeliveryNotePrintModel) {
  const lines = [
    `小計：${formatMoney(model.subtotal)}`,
    `運費：${formatMoney(model.freightAmount)}`,
    `稅額：${model.taxDisplay}`,
    `總計：${formatMoney(model.totalAmount)} ${model.currency}`,
  ];
  lines.forEach((text, index) =>
    page.drawText(text, {
      x: 390,
      y: 112 - index * 17,
      size: index === 3 ? 11 : 10,
      font,
    }),
  );
  page.drawText(
    `文件版本 ${DELIVERY_NOTE_DOCUMENT_VERSION}／版型 ${DELIVERY_NOTE_PDF_TEMPLATE_VERSION}`,
    { x: MARGIN, y: 36, size: 7, font },
  );
}

export class DeterministicDeliveryNotePdfRenderer
  implements DeliveryNotePdfRenderer
{
  constructor(
    private readonly fontLoader: () => Promise<LoadedDeliveryNoteFont> =
      loadDeliveryNoteFont,
  ) {}

  async render(
    model: DeliveryNotePrintModel,
  ): Promise<RenderedDeliveryNotePdf> {
    try {
      const loadedFont = await this.fontLoader();
      assertDeliveryNoteTextGlyphs(loadedFont.bytes, collectText(model));
      const pdf = await PDFDocument.create({ updateMetadata: false });
      pdf.registerFontkit(fontkit);
      pdf.setTitle(`Delivery Note ${model.deliveryNoteNumber}`);
      pdf.setAuthor(model.companyName);
      pdf.setSubject("Formal Delivery Note");
      pdf.setCreator(DELIVERY_NOTE_PDF_RENDERER_VERSION);
      pdf.setProducer(DELIVERY_NOTE_PDF_RENDERER_VERSION);
      pdf.setCreationDate(FIXED_PDF_DATE);
      pdf.setModificationDate(FIXED_PDF_DATE);
      const font = await pdf.embedFont(loadedFont.bytes, { subset: true });
      let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      let y = drawHeader(page, font, model);
      for (const line of model.lines) {
        if (y < 145) {
          drawFooter(page, font, model);
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = drawHeader(page, font, model);
        }
        const values = [
          String(line.lineNumber),
          `${line.itemCode}/${line.companyItemCode} ${line.description}`.slice(
            0,
            40,
          ),
          line.quantity,
          line.unit,
          line.unitPrice,
          formatMoney(line.amount),
        ];
        values.forEach((text, index) =>
          page.drawText(text, {
            x: [MARGIN + 4, 82, 337, 390, 432, 505][index],
            y,
            size: 8,
            font,
          }),
        );
        y -= 17;
      }
      drawFooter(page, font, model);
      const bytes = Buffer.from(
        await pdf.save({
          useObjectStreams: false,
          addDefaultPage: false,
          objectsPerTick: Number.POSITIVE_INFINITY,
          updateFieldAppearances: false,
        }),
      );
      if (
        bytes.byteLength < 5 ||
        bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
      ) {
        throw new DeliveryNotePdfRenderError(
          "DELIVERY_NOTE_PDF_INVALID",
          "Renderer 未產生有效 PDF",
        );
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return Object.freeze({
        bytes,
        mimeType: DELIVERY_NOTE_PDF_MIME_TYPE,
        byteSize: bytes.byteLength,
        sha256,
        filename: safeFilename(model.deliveryNoteNumber),
        documentVersion: DELIVERY_NOTE_DOCUMENT_VERSION,
        rendererVersion: DELIVERY_NOTE_PDF_RENDERER_VERSION,
        templateVersion: DELIVERY_NOTE_PDF_TEMPLATE_VERSION,
        fontVersion: loadedFont.manifest.fontVersion,
        snapshotVersion: model.snapshotVersion,
      });
    } catch (error) {
      if (
        error instanceof DeliveryNotePdfRenderError ||
        (error instanceof Error && error.name === "DeliveryNoteFontError")
      ) {
        throw error;
      }
      throw new DeliveryNotePdfRenderError(
        "DELIVERY_NOTE_PDF_RENDER_FAILED",
        `正式銷貨單 PDF 產生失敗：${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }
}
