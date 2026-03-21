/**
 * Offline Tax Invoice Queue
 * Stores pending tax invoices locally and syncs them when online.
 */
import { db } from "@/db/appDb";
import type { Order, Settings } from "@/db/schema";

export type TaxInvoiceStatus = "pending" | "synced" | "failed";

export type TaxInvoiceQueueItem = {
  id: string;
  orderId: string;
  receiptNo: number;
  invoiceData: {
    businessNtn: string;
    posId: string;
    receiptNo: number;
    dateTime: number;
    subtotal: number;
    taxAmount: number;
    total: number;
    taxLabel: string;
    taxPercent: number;
    items: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }>;
  };
  status: TaxInvoiceStatus;
  attempts: number;
  lastAttemptAt?: number;
  syncedAt?: number;
  errorMessage?: string;
  createdAt: number;
};

/** Build a tax invoice entry from an order */
export function buildTaxInvoice(order: Order, settings: Settings): TaxInvoiceQueueItem {
  return {
    id: `tiq_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
    orderId: order.id,
    receiptNo: order.receiptNo,
    invoiceData: {
      businessNtn: settings.taxApiBusinessNtn ?? "",
      posId: settings.taxApiPosId ?? "",
      receiptNo: order.receiptNo,
      dateTime: order.createdAt,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      total: order.total,
      taxLabel: settings.taxLabel ?? "Tax",
      taxPercent: settings.taxType === "percent" ? (settings.taxValue ?? 0) : 0,
      items: order.lines.map(l => ({
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
      })),
    },
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };
}

/** Queue a tax invoice for later sync */
export async function queueTaxInvoice(order: Order, settings: Settings): Promise<void> {
  if (!settings.taxApiEnabled) return;
  if (!settings.taxApiEndpoint || !settings.taxApiKey) return;
  
  const item = buildTaxInvoice(order, settings);
  await db.taxInvoiceQueue.put(item);
  
  // Try to sync immediately if online
  if (navigator.onLine) {
    void syncPendingTaxInvoices().catch(() => {});
  }
}

/** Get all pending invoices */
export async function getPendingInvoices(): Promise<TaxInvoiceQueueItem[]> {
  return db.taxInvoiceQueue.where("status").equals("pending").toArray();
}

/** Get queue stats */
export async function getQueueStats(): Promise<{ pending: number; synced: number; failed: number }> {
  const all = await db.taxInvoiceQueue.toArray();
  return {
    pending: all.filter(i => i.status === "pending").length,
    synced: all.filter(i => i.status === "synced").length,
    failed: all.filter(i => i.status === "failed").length,
  };
}

/** Attempt to sync a single invoice to the tax API */
async function syncInvoice(item: TaxInvoiceQueueItem, settings: Settings): Promise<boolean> {
  if (!settings.taxApiEndpoint || !settings.taxApiKey) return false;
  
  try {
    const response = await fetch(settings.taxApiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.taxApiKey}`,
      },
      body: JSON.stringify(item.invoiceData),
      signal: AbortSignal.timeout(15000),
    });
    
    if (response.ok) {
      await db.taxInvoiceQueue.update(item.id, {
        status: "synced" as TaxInvoiceStatus,
        syncedAt: Date.now(),
        attempts: item.attempts + 1,
        lastAttemptAt: Date.now(),
      });
      return true;
    }
    
    // Non-OK response
    const errText = await response.text().catch(() => "Unknown error");
    await db.taxInvoiceQueue.update(item.id, {
      status: item.attempts >= 4 ? ("failed" as TaxInvoiceStatus) : ("pending" as TaxInvoiceStatus),
      attempts: item.attempts + 1,
      lastAttemptAt: Date.now(),
      errorMessage: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
    });
    return false;
  } catch (e: any) {
    await db.taxInvoiceQueue.update(item.id, {
      status: item.attempts >= 4 ? ("failed" as TaxInvoiceStatus) : ("pending" as TaxInvoiceStatus),
      attempts: item.attempts + 1,
      lastAttemptAt: Date.now(),
      errorMessage: e?.message ?? String(e),
    });
    return false;
  }
}

/** Sync all pending invoices */
export async function syncPendingTaxInvoices(): Promise<{ synced: number; failed: number }> {
  const settings = await db.settings.get("app");
  if (!settings?.taxApiEnabled || !settings.taxApiEndpoint) {
    return { synced: 0, failed: 0 };
  }
  
  const pending = await getPendingInvoices();
  let synced = 0;
  let failed = 0;
  
  for (const item of pending) {
    const ok = await syncInvoice(item, settings);
    if (ok) synced++;
    else failed++;
  }
  
  return { synced, failed };
}

/** Retry failed invoices (reset status to pending) */
export async function retryFailedInvoices(): Promise<number> {
  const failed = await db.taxInvoiceQueue.where("status").equals("failed").toArray();
  for (const item of failed) {
    await db.taxInvoiceQueue.update(item.id, {
      status: "pending" as TaxInvoiceStatus,
      attempts: 0,
      errorMessage: undefined,
    });
  }
  return failed.length;
}

// Auto-sync when coming online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void syncPendingTaxInvoices().catch(console.warn);
  });
}
