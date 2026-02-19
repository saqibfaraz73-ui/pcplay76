/**
 * Licensing DB — Play Store + AdMob system
 *
 * Free limits per section: 5 entries
 * After limit: watch a rewarded ad → get +3 entries
 * Premium (Play Store): no limits, no ads
 */

import { db } from "@/db/appDb";
import { checkPlayStorePremium } from "./play-store-billing";

export type LicenseRecord = {
  id: "license";
  deviceId: string;
  licensedDeviceId?: string;
  activationKey?: string;
  isPremium: boolean;
  validUntil?: number;
  upgradeMessage?: string;
  cashSalesCount: number;
  creditSalesCount: number;
  deliverySalesCount: number;
  tableSalesCount: number;
  partyLodgeCount: number;
  expensesCount: number;
  customPrintCount: number;
  labelPrintCount: number;
  // Ad bonus credits per module (resets do NOT count toward the base limit)
  cashAdBonus: number;
  creditAdBonus: number;
  deliveryAdBonus: number;
  tableAdBonus: number;
  partyAdBonus: number;
  expensesAdBonus: number;
  customPrintAdBonus: number;
  labelPrintAdBonus: number;
};

/** Free entries per section before watching an ad */
export const FREE_LIMIT = 5;
/** Entries granted after watching a rewarded ad */
export const AD_BONUS = 3;

/** Generate a deterministic device ID from browser/hardware properties */
function generateDeviceId(): string {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const scr = typeof screen !== "undefined" ? screen : null;
  const parts = [
    nav?.userAgent ?? "",
    nav?.language ?? "",
    nav?.languages?.join(",") ?? "",
    String(scr?.width ?? 0),
    String(scr?.height ?? 0),
    String(scr?.colorDepth ?? 0),
    String(new Date().getTimezoneOffset()),
    String(nav?.hardwareConcurrency ?? 0),
    String((nav as any)?.deviceMemory ?? 0),
    String(nav?.maxTouchPoints ?? 0),
    nav?.platform ?? "",
  ];
  const seed = parts.join("|");
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  const hex1 = Math.abs(h1).toString(16).toUpperCase().padStart(8, "0");
  const hex2 = Math.abs(h2).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  return `SNG-${hex1}-${hex2}`;
}

function defaultRecord(deviceId: string): LicenseRecord {
  return {
    id: "license",
    deviceId,
    isPremium: false,
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

export async function getLicense(): Promise<LicenseRecord> {
  let rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;

  if (!rec) {
    const deviceId = generateDeviceId();
    rec = defaultRecord(deviceId);
    await (db as any).license.put(rec);
  }

  // Ensure bonus fields exist on old records
  const bonusFields: (keyof LicenseRecord)[] = [
    "cashAdBonus", "creditAdBonus", "deliveryAdBonus", "tableAdBonus",
    "partyAdBonus", "expensesAdBonus", "customPrintAdBonus", "labelPrintAdBonus",
  ];
  let needsUpdate = false;
  for (const field of bonusFields) {
    if (rec[field] === undefined) {
      (rec as any)[field] = 0;
      needsUpdate = true;
    }
  }
  if (needsUpdate) await (db as any).license.put(rec);

  // Check Play Store premium status
  try {
    const status = await checkPlayStorePremium();
    if (status.isPremium !== rec.isPremium) {
      rec = { ...rec, isPremium: status.isPremium, validUntil: status.expiresAt };
      await (db as any).license.put(rec);
    }
  } catch {
    // Ignore — use cached value
  }

  return rec;
}

export async function updateLicense(partial: Partial<Omit<LicenseRecord, "id">>): Promise<void> {
  const current = await getLicense();
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
 * - Premium: always allowed
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
  if (!rec || rec.isPremium) return;
  const key = countKey[module];
  await (db as any).license.put({
    ...rec,
    [key]: ((rec[key] as number) ?? 0) + count,
  });
}
