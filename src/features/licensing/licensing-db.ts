/**
 * Licensing DB table stored in Dexie alongside existing app data.
 * Premium is activated via Super Admin login (device-specific PIN).
 */
import { db } from "@/db/appDb";

export type LicenseRecord = {
  id: "license";
  deviceId: string;
  licensedDeviceId?: string; // The device ID this license is activated for
  activationKey?: string;
  isPremium: boolean;
  upgradeMessage?: string;
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

  // Premium only valid if current device matches the licensed device
  if (rec.isPremium && rec.licensedDeviceId) {
    const currentDeviceId = rec.deviceId;
    if (currentDeviceId !== rec.licensedDeviceId) {
      // Device mismatch — not premium on this device
      return { ...rec, isPremium: false };
    }
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

