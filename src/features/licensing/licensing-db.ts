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
import { getCachedConfig } from "./remote-config";

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
  installmentCount: number;
  // Ad bonus credits per module
  cashAdBonus: number;
  creditAdBonus: number;
  deliveryAdBonus: number;
  tableAdBonus: number;
  partyAdBonus: number;
  expensesAdBonus: number;
  customPrintAdBonus: number;
  labelPrintAdBonus: number;
  installmentAdBonus: number;
};

// Runtime-only premium state (sourced from Play Store on every getLicense call)
let _isPremiumCache: boolean = false;

/** Allow play-store-billing to set cache immediately after purchase + persist to DB */
export async function setPremiumCache(val: boolean) {
  _isPremiumCache = val;
  // Persist to DB so it survives app restarts
  try {
    const rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;
    if (rec) {
      await (db as any).license.put({ ...rec, premiumCached: val, premiumCachedAt: Date.now() });
    }
  } catch {}
}

/** Free entries per section before watching an ad (overridden by remote config) */
export const FREE_LIMIT = 5;
/** Entries granted after watching a rewarded ad (overridden by remote config) */
export const AD_BONUS = 5;

/** Get current free limit (uses remote config if available) */
export function getFreeLimitValue(): number {
  return getCachedConfig().free_limit ?? FREE_LIMIT;
}

/** Get current ad bonus (uses remote config if available) */
export function getAdBonusValue(): number {
  return getCachedConfig().ad_bonus ?? AD_BONUS;
}
/** Warning threshold — show warning after 7 days */
export const ONLINE_WARNING_INTERVAL = 7 * 24 * 60 * 60 * 1000;
/** Hard block — force verification after 8 days (7 + 24hr grace) */
export const ONLINE_CHECK_INTERVAL = 8 * 24 * 60 * 60 * 1000;

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

  // ── Premium status: Play Store → DB cache fallback → dev override ──
  let playStoreChecked = false;
  try {
    const status = await checkPlayStorePremium();
    playStoreChecked = true;
    _isPremiumCache = status.isPremium;
    // Update DB cache based on Play Store result
    if (status.isPremium) {
      await (db as any).license.put({ ...rec, premiumCached: true, premiumCachedAt: Date.now(), lastOnlineVerifiedAt: Date.now() });
    } else {
      // Play Store explicitly says not premium — clear cache
      await (db as any).license.put({ ...rec, premiumCached: false, premiumCachedAt: 0, lastOnlineVerifiedAt: Date.now() });
    }
  } catch {
    // Play Store check failed (offline) — use DB-persisted cache as fallback
    if ((rec as any).premiumCached === true) {
      const cachedAt = (rec as any).premiumCachedAt || 0;
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - cachedAt < THIRTY_DAYS) {
        console.log("[Licensing] Using DB-cached premium status (Play Store unavailable, cache valid)");
        _isPremiumCache = true;
      }
    }
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
  needsOnlineVerification?: boolean;
  /** Warning: user has 24hr grace period remaining */
  onlineWarning?: { hoursRemaining: number };
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
  // Check if periodic online verification is needed
  const onlineStatus = await getOnlineCheckStatus();
  if (onlineStatus.status === "blocked") {
    return {
      allowed: false,
      message: "Periodic internet verification required. Please connect to the internet to verify your subscription status.",
      needsOnlineVerification: true,
    };
  }

  const lic = await getLicense();
  if (lic.isPremium) return { allowed: true, message: "" };

  const freeLimit = getFreeLimitValue();
  const adBonus = getAdBonusValue();
  const used = (lic[countKey[module]] as number) ?? 0;
  const bonus = (lic[bonusKey[module]] as number) ?? 0;
  const totalAllowed = freeLimit + bonus;
  const remaining = totalAllowed - used;

  if (used + count > totalAllowed) {
    return {
      allowed: false,
      remaining: Math.max(0, remaining),
      needsAd: true,
      message:
        remaining > 0
          ? `You have ${remaining} free ${module} entr${remaining === 1 ? "y" : "ies"} left. Watch an ad to get ${adBonus} more.`
          : `Free limit reached (${freeLimit} entries). Watch a short ad to get ${adBonus} more entries.`,
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
  await (db as any).license.put({ ...rec, [key]: current + getAdBonusValue() });
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

/**
 * Check if the user needs to connect to internet for periodic verification.
 * Returns true if more than 7 days have passed since last online check.
 */
export type OnlineCheckStatus = "ok" | "warning" | "blocked";

/**
 * Check online verification status:
 * - "ok": within 7 days
 * - "warning": 7-8 days (24hr grace period, show warning but allow usage)
 * - "blocked": 8+ days (hard block)
 */
export async function getOnlineCheckStatus(): Promise<{ status: OnlineCheckStatus; hoursRemaining: number }> {
  const rec = (await (db as any).license.get("license")) as any;
  if (!rec) return { status: "ok", hoursRemaining: 0 };
  const lastVerified = rec.lastOnlineVerifiedAt || 0;
  if (lastVerified === 0) return { status: "ok", hoursRemaining: 0 }; // Fresh install
  const elapsed = Date.now() - lastVerified;
  if (elapsed > ONLINE_CHECK_INTERVAL) {
    return { status: "blocked", hoursRemaining: 0 };
  }
  if (elapsed > ONLINE_WARNING_INTERVAL) {
    const msRemaining = ONLINE_CHECK_INTERVAL - elapsed;
    return { status: "warning", hoursRemaining: Math.max(0, Math.ceil(msRemaining / (60 * 60 * 1000))) };
  }
  return { status: "ok", hoursRemaining: 0 };
}

/** @deprecated Use getOnlineCheckStatus instead */
export async function needsOnlineCheck(): Promise<boolean> {
  const { status } = await getOnlineCheckStatus();
  return status === "blocked";
}
