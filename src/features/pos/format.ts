export function formatIntMoney(value: number): string {
  // Spec: show only numbers (no currency symbol) and no decimals.
  // We still keep calculations as numbers; UI formats as whole numbers.
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  return `${n}`;
}

export function parseNonDecimalInt(input: string): number {
  // Accept empty as 0; strip non-digits.
  const cleaned = (input ?? "").replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  return Math.max(0, parseInt(cleaned, 10));
}
