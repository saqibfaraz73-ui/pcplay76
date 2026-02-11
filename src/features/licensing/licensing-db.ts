/**
 * Licensing DB table stored in Dexie alongside existing app data.
 * We store: deviceId, activationKey, premium status, usage counts, and upgrade message.
 */
import { db } from "@/db/appDb";
import { PRELOADED_DEVICE_ID, PRELOADED_ACTIVATION_KEY } from "./preloaded-license";

export type LicenseRecord = {
  id: "license";
  deviceId: string;
  activationKey?: string;
  isPremium: boolean;
  upgradeMessage?: string; // customizable by super admin
  // Usage counters per module
  cashSalesCount: number;
  creditSalesCount: number;
  deliverySalesCount: number;
  tableSalesCount: number;
  partyLodgeCount: number;
  expensesCount: number;
};

const MODULE_LIMIT = 10;
const TOTAL_LIMIT = 40;
const LODGE_LIMIT = 5;
const EXPENSE_LIMIT = 5;

/**
 * Generate a deterministic device ID from stable hardware/browser properties.
 * Same device will always produce the same ID, even after uninstall/reinstall.
 */
function generateDeviceId(): string {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const scr = typeof screen !== "undefined" ? screen : null;

  // Use only stable, non-random properties that survive reinstall
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
  let rec = await (db as any).license.get("license") as LicenseRecord | undefined;
  if (!rec) {
    rec = {
      id: "license",
      deviceId: generateDeviceId(),
      isPremium: false,
      cashSalesCount: 0,
      creditSalesCount: 0,
      deliverySalesCount: 0,
      tableSalesCount: 0,
      partyLodgeCount: 0,
      expensesCount: 0,
    };
    await (db as any).license.put(rec);
  }

  // Auto-activate from preloaded license if device matches
  if (
    !rec.isPremium &&
    PRELOADED_DEVICE_ID !== "" &&
    PRELOADED_ACTIVATION_KEY !== "" &&
    rec.deviceId === PRELOADED_DEVICE_ID
  ) {
    rec.isPremium = true;
    rec.activationKey = PRELOADED_ACTIVATION_KEY.trim().toUpperCase();
    await (db as any).license.put(rec);
  }

  return rec;
}

export async function updateLicense(partial: Partial<Omit<LicenseRecord, "id">>): Promise<void> {
  const current = await getLicense();
  await (db as any).license.put({ ...current, ...partial });
}

export type SalesModule = "cash" | "credit" | "delivery" | "table" | "partyLodge" | "expenses";

const moduleKey: Record<SalesModule, keyof LicenseRecord> = {
  cash: "cashSalesCount",
  credit: "creditSalesCount",
  delivery: "deliverySalesCount",
  table: "tableSalesCount",
  partyLodge: "partyLodgeCount",
  expenses: "expensesCount",
};

const moduleLimit: Partial<Record<SalesModule, number>> = {
  partyLodge: LODGE_LIMIT,
  expenses: EXPENSE_LIMIT,
};

export async function canMakeSale(module: SalesModule): Promise<{ allowed: boolean; message: string }> {
  const lic = await getLicense();
  if (lic.isPremium) return { allowed: true, message: "" };

  const moduleCount = (lic[moduleKey[module]] as number) ?? 0;
  const limit = moduleLimit[module] ?? MODULE_LIMIT;

  // For sales modules, also check total limit
  if (module !== "partyLodge" && module !== "expenses") {
    const total = lic.cashSalesCount + lic.creditSalesCount + lic.deliverySalesCount + lic.tableSalesCount;
    if (total >= TOTAL_LIMIT) {
      return {
        allowed: false,
        message: lic.upgradeMessage || `You have reached the free limit of ${TOTAL_LIMIT} total receipts. Please upgrade to Premium to continue.`,
      };
    }
  }

  if (moduleCount >= limit) {
    return {
      allowed: false,
      message: lic.upgradeMessage || `You have reached the free limit of ${limit} entries for this module. Please upgrade to Premium to continue.`,
    };
  }
  return { allowed: true, message: "" };
}

export async function incrementSaleCount(module: SalesModule): Promise<void> {
  const lic = await getLicense();
  if (lic.isPremium) return;
  const key = moduleKey[module];
  await updateLicense({ [key]: (lic[key] as number) + 1 } as any);
}

/**
 * Deterministic key generation from a device ID.
 * Same device ID always produces the same key.
 * Used by Super Admin to generate keys and by the app to validate them.
 */
const KEY_SECRET = "SANGI_POS_2024_PRO";

export function generateKeyForDevice(deviceId: string): string {
  const seed = `${KEY_SECRET}::${deviceId}`;
  let h1 = 7919;
  let h2 = 104729;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = ((h1 << 5) - h1 + c) | 0;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  const p1 = Math.abs(h1).toString(36).toUpperCase().slice(0, 4);
  const p2 = Math.abs(h2).toString(36).toUpperCase().slice(0, 4);
  const p3 = Math.abs(h1 ^ h2).toString(36).toUpperCase().slice(0, 4);
  return `${p1}-${p2}-${p3}`;
}

export async function activatePremium(key: string, deviceId: string): Promise<boolean> {
  const expected = generateKeyForDevice(deviceId);
  const normalizedKey = key.trim().toUpperCase();
  // Accept deterministic key OR preloaded key for the specific preloaded device
  if (normalizedKey === expected || (PRELOADED_DEVICE_ID !== "" && deviceId === PRELOADED_DEVICE_ID && normalizedKey === PRELOADED_ACTIVATION_KEY.trim().toUpperCase())) {
    await updateLicense({ isPremium: true, activationKey: normalizedKey });
    return true;
  }
  return false;
}
