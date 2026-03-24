/**
 * Licensing DB — Device-specific activation system.
 * Premium is activated via Super Admin login (device-specific PIN)
 * or via PRELOADED_DEVICE_ID baked into the APK build.
 */
import { db } from "@/db/appDb";
import { PRELOADED_DEVICE_ID } from "./preloaded-license";
import { readLicenseFile } from "./license-file";

export type LicenseRecord = {
  id: "license";
  deviceId: string;
  licensedDeviceId?: string;
  activationKey?: string;
  isPremium: boolean;
  validUntil?: number; // timestamp – license expires after this date
  upgradeMessage?: string;
  cashSalesCount: number;
  creditSalesCount: number;
  deliverySalesCount: number;
  tableSalesCount: number;
  partyLodgeCount: number;
  expensesCount: number;
  customPrintCount: number;
  labelPrintCount: number;
  installmentCount: number;
  recoveryCount: number;
  daybookCount: number;
};

const MODULE_LIMIT = 15;
const TOTAL_LIMIT = 60;
const LODGE_LIMIT = 5;
const EXPENSE_LIMIT = 5;
const PRINT_LIMIT = 5;
const INSTALLMENT_LIMIT = 5;
const RECOVERY_LIMIT = 5;
const DAYBOOK_LIMIT = 5;

/**
 * Generate a deterministic device ID from stable hardware/browser properties.
 * Same device will always produce the same ID, even after uninstall/reinstall.
 */
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
    String(scr?.pixelDepth ?? 0),
    String(new Date().getTimezoneOffset()),
    String(nav?.hardwareConcurrency ?? 0),
    String((nav as any)?.deviceMemory ?? 0),
    String(nav?.maxTouchPoints ?? 0),
    nav?.platform ?? "",
  ];
  const seed = parts.join("|");

  // djb2 hash — deterministic
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  const hex1 = Math.abs(h1).toString(16).toUpperCase().padStart(8, "0");
  const hex2 = Math.abs(h2).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  return `SNG-${hex1}-${hex2}`;
}

export async function getLicense(): Promise<LicenseRecord> {
  let rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;
  const deviceId = generateDeviceId();

  if (!rec) {
    const preloadMatch = PRELOADED_DEVICE_ID && PRELOADED_DEVICE_ID === deviceId;
    rec = {
      id: "license",
      deviceId,
      isPremium: preloadMatch,
      licensedDeviceId: preloadMatch ? PRELOADED_DEVICE_ID : undefined,
      cashSalesCount: 0,
      creditSalesCount: 0,
      deliverySalesCount: 0,
      tableSalesCount: 0,
      partyLodgeCount: 0,
      expensesCount: 0,
      customPrintCount: 0,
      labelPrintCount: 0,
      installmentCount: 0,
      recoveryCount: 0,
      daybookCount: 0,
    };
    await (db as any).license.put(rec);
  }

  // Backfill deviceId
  if (!rec.deviceId) {
    rec = { ...rec, deviceId };
    await (db as any).license.put(rec);
  }

  // Check preloaded ID
  if (!rec.isPremium && PRELOADED_DEVICE_ID && PRELOADED_DEVICE_ID === rec.deviceId) {
    rec = { ...rec, isPremium: true, licensedDeviceId: PRELOADED_DEVICE_ID };
    await (db as any).license.put(rec);
  }

  // Check for encrypted license file activation
  if (!rec.isPremium) {
    try {
      const licFile = await readLicenseFile();
      if (licFile && licFile.deviceId === rec.deviceId) {
        let validUntilTs: number | undefined;
        if (licFile.validUntilTs && licFile.validUntilTs > 0) {
          validUntilTs = licFile.validUntilTs;
        } else if (licFile.validUntil) {
          const parts = licFile.validUntil.split("T")[0].split("-").map(Number);
          if (parts.length === 3) {
            validUntilTs = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
          } else {
            validUntilTs = new Date(licFile.validUntil).getTime();
          }
        }
        // Don't activate if already expired
        if (validUntilTs && validUntilTs > 0 && Date.now() > validUntilTs) {
          // expired — don't activate
        } else {
          rec = { ...rec, isPremium: true, licensedDeviceId: licFile.deviceId, validUntil: validUntilTs };
          await (db as any).license.put(rec);
        }
      }
    } catch {
      // License file not found or invalid
    }
  }

  // Premium only valid if current device matches
  if (rec.isPremium && rec.licensedDeviceId) {
    if (rec.deviceId !== rec.licensedDeviceId) {
      return { ...rec, isPremium: false };
    }
  }

  // Check license expiry
  if (rec.isPremium && rec.validUntil && rec.validUntil > 0) {
    if (Date.now() > rec.validUntil) {
      const expired = { ...rec, isPremium: false, upgradeMessage: "Your premium license has expired. Please contact support to renew." };
      await (db as any).license.put(expired);
      return expired;
    }
  }

  return rec;
}

export async function updateLicense(partial: Partial<Omit<LicenseRecord, "id">>): Promise<void> {
  const current = await getLicense();
  await (db as any).license.put({ ...current, ...partial });
}

export type SalesModule =
  | "cash" | "credit" | "delivery" | "table"
  | "partyLodge" | "expenses" | "customPrint" | "labelPrint" | "installment"
  | "recovery" | "daybook";

const moduleKey: Record<SalesModule, keyof LicenseRecord> = {
  cash: "cashSalesCount",
  credit: "creditSalesCount",
  delivery: "deliverySalesCount",
  table: "tableSalesCount",
  partyLodge: "partyLodgeCount",
  expenses: "expensesCount",
  customPrint: "customPrintCount",
  labelPrint: "labelPrintCount",
  installment: "installmentCount",
  recovery: "recoveryCount",
  daybook: "daybookCount",
};

const moduleLimit: Partial<Record<SalesModule, number>> = {
  partyLodge: LODGE_LIMIT,
  expenses: EXPENSE_LIMIT,
  customPrint: PRINT_LIMIT,
  labelPrint: PRINT_LIMIT,
  installment: INSTALLMENT_LIMIT,
  recovery: RECOVERY_LIMIT,
  daybook: DAYBOOK_LIMIT,
};

export type CanSaleResult = {
  allowed: boolean;
  message: string;
  remaining?: number;
  needsAd?: boolean;
  needsOnlineVerification?: boolean;
};

/** @deprecated No longer used — ads removed */
export const FREE_LIMIT = 15;

/** @deprecated No longer used — ads removed */
export function getAdBonusValue(): number { return 0; }

/** @deprecated No longer used — ads removed */
export async function grantAdBonus(_module: SalesModule): Promise<void> {}

/** @deprecated No longer used */
export type OnlineCheckStatus = "ok" | "warning" | "blocked";

/** @deprecated Always returns ok */
export async function getOnlineCheckStatus(): Promise<{ status: OnlineCheckStatus; hoursRemaining: number }> {
  return { status: "ok", hoursRemaining: 0 };
}

/** @deprecated */
export async function needsOnlineCheck(): Promise<boolean> {
  return false;
}

/** @deprecated */
export async function setPremiumCache(_val: boolean): Promise<void> {}

export async function canMakeSale(module: SalesModule, count: number = 1): Promise<CanSaleResult> {
  const lic = await getLicense();
  if (lic.isPremium) return { allowed: true, message: "" };

  const moduleCount = (lic[moduleKey[module]] as number) ?? 0;
  const limit = moduleLimit[module] ?? MODULE_LIMIT;

  // For sales modules, also check total limit
  if (module !== "partyLodge" && module !== "expenses" && module !== "customPrint" && module !== "labelPrint" && module !== "installment") {
    const total = lic.cashSalesCount + lic.creditSalesCount + lic.deliverySalesCount + lic.tableSalesCount;
    if (total >= TOTAL_LIMIT) {
      return {
        allowed: false,
        message: lic.upgradeMessage || `You have used ${total}/${TOTAL_LIMIT} free entries. Please upgrade to Premium to continue.`,
      };
    }
  }

  const remaining = limit - moduleCount;
  if (moduleCount + count > limit) {
    return {
      allowed: false,
      remaining: Math.max(0, remaining),
      message: lic.upgradeMessage || `You have used ${moduleCount}/${limit} free entries. ${remaining > 0 ? `Only ${remaining} remaining.` : "Limit reached."} Please upgrade to Premium to continue.`,
    };
  }
  return { allowed: true, message: "", remaining };
}

/**
 * Increment sale count. Safe inside Dexie transactions.
 */
export async function incrementSaleCount(module: SalesModule, count: number = 1): Promise<void> {
  const rec = (await (db as any).license.get("license")) as LicenseRecord | undefined;
  if (!rec || rec.isPremium) return;
  const key = moduleKey[module];
  await (db as any).license.put({
    ...rec,
    [key]: ((rec[key] as number) ?? 0) + count,
  });
}
