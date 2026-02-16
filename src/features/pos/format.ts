// Global currency symbol – loaded from settings at app start
let _currencySymbol = "Rs";

export function setCurrencySymbol(s: string) {
  _currencySymbol = s || "Rs";
}

export function getCurrencySymbol(): string {
  return _currencySymbol;
}

export function formatIntMoney(value: number): string {
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  return `${_currencySymbol} ${n}`;
}

export function parseNonDecimalInt(input: string): number {
  // Accept empty as 0; strip non-digits.
  const cleaned = (input ?? "").replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  return Math.max(0, parseInt(cleaned, 10));
}

/* ─── Global date / time formatting (DD/MM/YYYY, 12-hour) ─── */

/** Format timestamp or date-string as DD/MM/YYYY */
export function fmtDate(ts: number | string): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Format timestamp as DD/MM/YYYY h:mm AM/PM */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${fmtDate(ts)} ${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Format 24h time string "HH:mm" to 12h "h:mm AM/PM" */
export function fmtTime12(t: string): string {
  const [h24, mi] = t.split(":").map(Number);
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return `${h}:${String(mi).padStart(2, "0")} ${ampm}`;
}
