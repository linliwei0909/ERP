import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { DeliveryNoteFontError } from "@/lib/delivery-notes/errors";

export const DELIVERY_NOTE_FONT_MANIFEST = Object.freeze({
  family: "Noto Sans CJK TC",
  variant: "Regular",
  weight: 400,
  upstreamRepository: "https://github.com/notofonts/noto-cjk",
  upstreamRelease: "Sans2.004",
  upstreamCommit: "523d033d6cb47f4a80c58a35753646f5c3608a78",
  upstreamFilename: "NotoSansCJKtc-Regular.otf",
  repositoryAssetPath:
    "src/lib/delivery-notes/assets/NotoSansCJKtc-Regular.otf",
  license: "SIL Open Font License 1.1",
  licensePath: "src/lib/delivery-notes/assets/OFL-1.1.txt",
  byteSize: 16_435_884,
  sha256: "dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4",
  fontVersion: "noto-sans-cjk-tc-regular-sans2.004-dce08bd4",
} as const);

export type DeliveryNoteFontManifest = typeof DELIVERY_NOTE_FONT_MANIFEST;

export const DELIVERY_NOTE_REQUIRED_GLYPHS =
  "銷貨單正式列印公司客戶送貨地址聯絡人電話訂單品號品名規格數量單位單價金額小計運費稅額未分列總計實際出貨日備註年月日ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789，。！？：；（）【】「」／-_.+#%&$¥￥NT";

export type LoadedDeliveryNoteFont = Readonly<{
  manifest: DeliveryNoteFontManifest;
  bytes: Uint8Array;
}>;

export async function loadDeliveryNoteFont(
  manifest: DeliveryNoteFontManifest = DELIVERY_NOTE_FONT_MANIFEST,
): Promise<LoadedDeliveryNoteFont> {
  let bytes: Buffer;
  try {
    bytes = await readFile(resolve(process.cwd(), manifest.repositoryAssetPath));
  } catch {
    throw new DeliveryNoteFontError(
      "DELIVERY_NOTE_FONT_MISSING",
      "找不到正式銷貨單字型資產",
    );
  }
  if (bytes.byteLength !== manifest.byteSize) {
    throw new DeliveryNoteFontError(
      "DELIVERY_NOTE_FONT_CHECKSUM_MISMATCH",
      "正式銷貨單字型檔案大小與 manifest 不一致",
    );
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== manifest.sha256) {
    throw new DeliveryNoteFontError(
      "DELIVERY_NOTE_FONT_CHECKSUM_MISMATCH",
      "正式銷貨單字型 checksum 與 manifest 不一致",
    );
  }
  let parsed: ReturnType<typeof fontkit.create>;
  try {
    parsed = fontkit.create(bytes);
  } catch {
    throw new DeliveryNoteFontError(
      "DELIVERY_NOTE_FONT_PARSE_FAILED",
      "正式銷貨單字型無法解析",
    );
  }
  for (const character of DELIVERY_NOTE_REQUIRED_GLYPHS) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || !parsed.hasGlyphForCodePoint(codePoint)) {
      throw new DeliveryNoteFontError(
        "DELIVERY_NOTE_FONT_GLYPH_MISSING",
        `正式銷貨單字型缺少必要字元 U+${(codePoint ?? 0)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")}`,
      );
    }
  }
  return Object.freeze({ manifest, bytes: new Uint8Array(bytes) });
}

export function assertDeliveryNoteTextGlyphs(
  fontBytes: Uint8Array,
  text: string,
): void {
  let parsed: ReturnType<typeof fontkit.create>;
  try {
    parsed = fontkit.create(fontBytes);
  } catch {
    throw new DeliveryNoteFontError(
      "DELIVERY_NOTE_FONT_PARSE_FAILED",
      "正式銷貨單字型無法解析",
    );
  }
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      codePoint >= 0x20 &&
      !parsed.hasGlyphForCodePoint(codePoint)
    ) {
      throw new DeliveryNoteFontError(
        "DELIVERY_NOTE_FONT_GLYPH_MISSING",
        `正式銷貨單內容含字型未支援字元 U+${codePoint
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")}`,
      );
    }
  }
}
