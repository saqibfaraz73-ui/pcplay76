/**
 * Licensing DB — Google Play Store Billing + AdMob system
 *
 * Premium status is EXCLUSIVELY determined by Google Play Store.
 * The local DB only stores usage counts and ad bonus credits.
 *
 * Free limits per section: 5 entries
 * After limit: watch a rewarded ad → get +3 entries
 * Premium (Play Store): no limits, no ads
 */

import { db } from "@/db/appDb";
import { checkPlayStorePremium } from "./play-store-billing";

export type LicenseRecord = {
  id: "license";
  // Usage counters
  cashSalesCount: number;
  creditSalesCount: number;
  deliverySalesCount: number;
  tableSalesCount: number;
  partyLodgeCount: number;
  expensesCount: number;
  customPrintCount: number;
  labelPrintCount: number;
  // Ad bonus credits per module
  cashAdBonus: number;
  creditAdBonus: number;
  deliveryAdBonus: number;
  tableAdBonus: number;
  partyAdBonus: number;
  expensesAdBonus: number;
  customPrintAdBonus: number;
  labelPrintAdBonus: number;
};

// Runtime-only premium state (sourced from Play Store on every getLicense call)
let _isPremiumCache: boolean = false;

/** Free entries per section before watching an ad */
export const FREE_LIMIT = 5;
/** Entries granted after watching a rewarded ad */
export const AD_BONUS = 3;

function defaultRecord(): LicenseRecord {
  return {
    id: "license",
    cashSalesCount: 0,
    creditSalesCount: 0,
    deliverySalesCount: 0,
    tableSalesCount: 0,
    partyLodgeCount: 0,
    expensesCount: 0,
    customPrintCount: 0,
    labelPrintCount: 0,
    cashAdBonus: 0,
    creditAdBonus: 0,
    deliveryAdBonus: 0,
    tableAdBonus: 0,
    partyAdBonus: 0,
    expensesAdBonus: 0,
    customPrintAdBonus: 0,
    labelPrintAdBonus: 0,
  };
}

/**
 * Get license state. isPremium is ALWAYS sourced from Play Store — never from DB.
 */
export async function getLicense(): Promise<LicenseRecord & { isPremium: boolean; deviceId: string }> {
  let rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;

  if (!rec) {
    rec = defaultRecord();
    await (db as any).license.put(rec);
  }

  // Ensure all bonus/count fields exist (migration for older records)
  const allFields: (keyof LicenseRecord)[] = [
    "cashSalesCount", "creditSalesCount", "deliverySalesCount", "tableSalesCount",
    "partyLodgeCount", "expensesCount", "customPrintCount", "labelPrintCount",
    "cashAdBonus", "creditAdBonus", "deliveryAdBonus", "tableAdBonus",
    "partyAdBonus", "expensesAdBonus", "customPrintAdBonus", "labelPrintAdBonus",
  ];
  let needsUpdate = false;
  for (const field of allFields) {
    if ((rec as any)[field] === undefined) {
      (rec as any)[field] = 0;
      needsUpdate = true;
    }
  }
  if (needsUpdate) await (db as any).license.put(rec);

  // ── Premium status: Play Store OR dev override ──
  try {
    const status = await checkPlayStorePremium();
    _isPremiumCache = status.isPremium;
  } catch {
    // Keep last cached value on error
  }

  // Dev override via 7-tap About page gesture
  if (!_isPremiumCache && (rec as any).devPremiumOverride === true) {
    _isPremiumCache = true;
  }

  return { ...rec, isPremium: _isPremiumCache, deviceId: "" };
}

/**
 * Update only usage counters and ad bonus fields.
 * isPremium is intentionally excluded — only Play Store controls it.
 */
export async function updateLicense(partial: Partial<Omit<LicenseRecord, "id">>): Promise<void> {
  const current = (await (db as any).license.get("license")) as LicenseRecord | undefined ?? defaultRecord();
  await (db as any).license.put({ ...current, ...partial });
}

export type SalesModule =
  | "cash" | "credit" | "delivery" | "table"
  | "partyLodge" | "expenses" | "customPrint" | "labelPrint";

const countKey: Record<SalesModule, keyof LicenseRecord> = {
  cash: "cashSalesCount",
  credit: "creditSalesCount",
  delivery: "deliverySalesCount",
  table: "tableSalesCount",
  partyLodge: "partyLodgeCount",
  expenses: "expensesCount",
  customPrint: "customPrintCount",
  labelPrint: "labelPrintCount",
};

const bonusKey: Record<SalesModule, keyof LicenseRecord> = {
  cash: "cashAdBonus",
  credit: "creditAdBonus",
  delivery: "deliveryAdBonus",
  table: "tableAdBonus",
  partyLodge: "partyAdBonus",
  expenses: "expensesAdBonus",
  customPrint: "customPrintAdBonus",
  labelPrint: "labelPrintAdBonus",
};

export type CanSaleResult = {
  allowed: boolean;
  message: string;
  remaining?: number;
  needsAd?: boolean;
};

/**
 * Check if an action is allowed.
 * - Premium (Play Store): always allowed
 * - Free: up to FREE_LIMIT + adBonus entries
 * - At limit: needsAd = true
 */
export async function canMakeSale(
  module: SalesModule,
  count: number = 1
): Promise<CanSaleResult> {
  const lic = await getLicense();
  if (lic.isPremium) return { allowed: true, message: "" };

  const used = (lic[countKey[module]] as number) ?? 0;
  const bonus = (lic[bonusKey[module]] as number) ?? 0;
  const totalAllowed = FREE_LIMIT + bonus;
  const remaining = totalAllowed - used;

  if (used + count > totalAllowed) {
    return {
      allowed: false,
      remaining: Math.max(0, remaining),
      needsAd: true,
      message:
        remaining > 0
          ? `You have ${remaining} free ${module} entr${remaining === 1 ? "y" : "ies"} left. Watch an ad to get ${AD_BONUS} more.`
          : `Free limit reached (${FREE_LIMIT} entries). Watch a short ad to get ${AD_BONUS} more entries.`,
    };
  }

  return { allowed: true, message: "", remaining };
}

/**
 * Grant ad bonus entries for a module (called after user watches an ad).
 */
export async function grantAdBonus(module: SalesModule): Promise<void> {
  const rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;
  if (!rec) return;
  const key = bonusKey[module];
  const current = (rec[key] as number) ?? 0;
  await (db as any).license.put({ ...rec, [key]: current + AD_BONUS });
}

/**
 * Increment usage count. Safe inside Dexie transactions.
 */
export async function incrementSaleCount(
  module: SalesModule,
  count: number = 1
): Promise<void> {
  const rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;
  if (!rec) return;
  if (_isPremiumCache) return; // premium users never count
  const key = countKey[module];
  await (db as any).license.put({
    ...rec,
    [key]: ((rec[key] as number) ?? 0) + count,
  });
}
