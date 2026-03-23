/**
 * Shared tax calculation utilities for all modules.
 * Reads global tax settings from Settings and computes tax amount.
 */
import type { Settings } from "@/db/schema";

/** Calculate tax amount from global settings on a given subtotal */
export function calcGlobalTax(subtotal: number, settings: Settings | null): number {
  if (!settings?.taxEnabled || !settings.taxValue) return 0;
  if (settings.taxType === "percent") {
    return Math.round(subtotal * settings.taxValue / 100);
  }
  // fixed amount
  return Math.round(settings.taxValue);
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
