const QUANTITY_SCALE = BigInt(10_000);
const UNIT_PRICE_SCALE = BigInt(100_000);
const LINE_PRODUCT_SCALE = QUANTITY_SCALE * UNIT_PRICE_SCALE;

function parseScaled(value: string, decimals: number, label: string): bigint {
  const normalized = value.trim();
  const pattern =
    decimals === 4
      ? /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/
      : /^(?:0|[1-9]\d{0,12})(?:\.\d{1,5})?$/;
  if (!pattern.test(normalized)) {
    throw new Error(`${label}格式不正確`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  );
}

export function normalizeQuantity(value: string | number): string {
  const scaled = parseScaled(String(value), 4, "數量");
  if (scaled <= BigInt(0)) throw new Error("數量必須大於 0");
  const whole = scaled / QUANTITY_SCALE;
  const fraction = (scaled % QUANTITY_SCALE)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function normalizeUnitPrice(value: string | number): string {
  const scaled = parseScaled(String(value), 5, "未稅單價");
  const whole = scaled / UNIT_PRICE_SCALE;
  const fraction = (scaled % UNIT_PRICE_SCALE)
    .toString()
    .padStart(5, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function calculateLineAmount(
  quantity: string | number,
  unitPrice: string | number,
): string {
  const raw =
    parseScaled(String(quantity), 4, "數量") *
    parseScaled(String(unitPrice), 5, "未稅單價");
  const whole = raw / LINE_PRODUCT_SCALE;
  const remainder = raw % LINE_PRODUCT_SCALE;
  return (
    whole +
      (remainder * BigInt(2) >= LINE_PRODUCT_SCALE
        ? BigInt(1)
        : BigInt(0))
  ).toString();
}

export function addIntegerAmounts(values: readonly string[]): string {
  return values
    .reduce((total, value) => total + BigInt(value), BigInt(0))
    .toString();
}

export function addQuantities(values: readonly string[]): string {
  const total = values.reduce(
    (sum, value) => sum + parseScaled(value, 4, "數量"),
    BigInt(0),
  );
  const whole = total / QUANTITY_SCALE;
  const fraction = (total % QUANTITY_SCALE)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
