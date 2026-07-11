export const MAX_DATABASE_INT = 2147483647;

export function databaseInt(value: unknown, fallback = 0) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT) return number;
  return fallback;
}

export function safeBigInt(value: unknown) {
  if (typeof value === "bigint" && value > BigInt(0)) return value;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? BigInt(number) : null;
}

export function positiveVersion(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : 0;
}

export function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function optionalText(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

export function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}
