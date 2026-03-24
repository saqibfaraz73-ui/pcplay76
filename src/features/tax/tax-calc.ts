/**
 * Shared tax calculation utilities for all modules.
 * Reads global tax settings from Settings and computes tax amount.
 * Falls back to API-fetched tax rate when no manual taxValue is configured.
 */
import type { Settings } from "@/db/schema";

/** In-memory cache for API-fetched tax rate */
let cachedApiTaxRate: number | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/** Fetch tax rate from API and cache it. Works with API Ninjas sales tax endpoint. */
export async function fetchTaxRateFromApi(settings: Settings | null): Promise<number | null> {
  if (!settings?.taxApiEnabled || !settings.taxApiEndpoint || !settings.taxApiKey || !settings.taxApiFetchRate) return null;

  // Return cached value if fresh
  if (cachedApiTaxRate !== null && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedApiTaxRate;
  }

  try {
    const isApiNinjas = settings.taxApiEndpoint.includes("api-ninjas.com");
    const resp = await fetch(settings.taxApiEndpoint, {
      method: isApiNinjas ? "GET" : "POST",
      headers: isApiNinjas
        ? { "X-Api-Key": settings.taxApiKey }
        : {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.taxApiKey}`,
          },
      ...(!isApiNinjas && {
        body: JSON.stringify({ action: "get_tax_rate" }),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return cachedApiTaxRate;

    const data = await resp.json();

    // API Ninjas sales tax: returns array like [{ total_rate: "0.0825", ... }]
    // or object like { total_rate: "0.0825" } or { tax_rate: 8.25 } or { rate: 15 }
    let rate: number | null = null;

    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      if (item.total_rate != null) rate = parseFloat(item.total_rate) * 100;
      else if (item.tax_rate != null) rate = parseFloat(item.tax_rate);
      else if (item.rate != null) rate = parseFloat(item.rate);
    } else if (data && typeof data === "object") {
      if (data.total_rate != null) rate = parseFloat(data.total_rate) * 100;
      else if (data.tax_rate != null) rate = parseFloat(data.tax_rate);
      else if (data.rate != null) rate = parseFloat(data.rate);
    }

    if (rate != null && !isNaN(rate) && rate > 0) {
      cachedApiTaxRate = Math.round(rate * 100) / 100; // e.g. 8.25
      cacheTimestamp = Date.now();
      return cachedApiTaxRate;
    }

    return cachedApiTaxRate; // return old cache if parse failed
  } catch {
    return cachedApiTaxRate; // return old cache on network error
  }
}

/** Get effective tax percent — manual setting first, then API cache */
export function getEffectiveTaxPercent(settings: Settings | null): number {
  if (settings?.taxValue && settings.taxValue > 0) return settings.taxValue;
  if (cachedApiTaxRate != null && cachedApiTaxRate > 0) return cachedApiTaxRate;
  return 0;
}

/** Clear cached API rate (e.g. when settings change) */
export function clearTaxRateCache(): void {
  cachedApiTaxRate = null;
  cacheTimestamp = 0;
}

/** Calculate tax amount from global settings on a given subtotal.
 *  Uses manual taxValue if set, otherwise falls back to cached API rate. */
export function calcGlobalTax(subtotal: number, settings: Settings | null): number {
  if (!settings?.taxEnabled) return 0;

  const rate = getEffectiveTaxPercent(settings);
  let tax = 0;

  if (rate > 0) {
    // If manual taxValue is set and type is fixed amount (not percent)
    if (settings.taxValue && settings.taxValue > 0 && settings.taxType !== "percent") {
      tax = Math.round(settings.taxValue);
    } else {
      // Percent-based (either manual or from API)
      tax = Math.round(subtotal * rate / 100);
    }
  }

  // Add per-receipt fee (e.g. FBR Rs 1)
  if (settings.taxReceiptFeeEnabled && settings.taxReceiptFee && settings.taxReceiptFee > 0) {
    tax += Math.round(settings.taxReceiptFee);
  }

  return tax;
}

/** Get the tax label from settings (e.g. "GST", "VAT") */
export function getTaxLabel(settings: Settings | null): string {
  return settings?.taxLabel || "Tax";
}

/** Calculate custom tax (for supplier arrivals — user enters amount or percent) */
export function calcCustomTax(subtotal: number, taxType: "amount" | "percent", taxValue: number): number {
  if (!taxValue || taxValue <= 0) return 0;
  if (taxType === "percent") {
    return Math.round(subtotal * taxValue / 100);
  }
  return Math.round(taxValue);
}
