# Kitchen Display System (KDS) — Setup Guide

## Overview

The Kitchen Display System adds real-time order tracking between the POS, kitchen staff, and customer-facing displays. It uses the existing local sync infrastructure (WiFi/hotspot).

## Architecture

```
Sales Device (POS) → Main Device (stores kitchen orders)
                          ↕ (polling every 3s)
                    Kitchen Device (updates status: pending → preparing → ready → served)
                          ↕ (polling every 3s)
                    Customer Display (read-only: shows order progress)
```

## How It Works

1. **Admin enables Kitchen Display** in Settings → Kitchen Display (KDS) toggle
2. **Main device** runs the sync server (same as normal sync setup)
3. When orders are placed on Main, they're saved to `kitchenOrders` table
4. **Kitchen staff** open `/kitchen` on a separate device/tablet:
   - Scan the Main device's IP barcode (or enter manually)
   - Enter the connection PIN (if set)
   - See live order queue with large cards
   - Tap to update status: New → Preparing → Ready → Served
5. **Customer display** (also at `/kitchen`, choose "Customer Display" mode):
   - Shows 3-column layout: In Queue | Preparing | Ready
   - Bell sound plays when orders become ready
   - Suitable for TV/large screen mounting

## Native Plugin Changes Required

### LocalSyncServerPlugin.java

Add support for GET endpoints and query/response pattern:

1. **Add GET route handling** for `/sync/kitchen-orders` and `/sync/kitchen-display`:

```java
// In the HTTP server request handler:
if (method.equals("GET") && uri.startsWith("/sync/kitchen-")) {
    String endpoint = uri.replace("/sync/", "");
    String requestId = UUID.randomUUID().toString();
    
    // Store pending response
    pendingQueries.put(requestId, exchange);
    
    // Fire event to JavaScript
    JSObject data = new JSObject();
    data.put("endpoint", endpoint);
    data.put("requestId", requestId);
    notifyListeners("syncQueryReceived", data);
    
    // Wait for response (with timeout)
    // ... see implementation below
}
```

2. **Add `respondToQuery` method**:

```java
@PluginMethod
public void respondToQuery(PluginCall call) {
    String requestId = call.getString("requestId");
    String data = call.getString("data");
    
    HttpExchange exchange = pendingQueries.remove(requestId);
    if (exchange != null) {
        byte[] response = data.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, response.length);
        exchange.getResponseBody().write(response);
        exchange.getResponseBody().close();
    }
    call.resolve();
}
```

3. **Add pending queries map**:

```java
private final ConcurrentHashMap<String, HttpExchange> pendingQueries = new ConcurrentHashMap<>();
```

### AndroidManifest.xml

No additional permissions needed beyond existing sync setup (INTERNET, ACCESS_WIFI_STATE, etc.)

### build.gradle

No changes required.

## Files Created/Modified

### New Files
- `src/db/kitchen-schema.ts` — KitchenOrder type definitions
- `src/features/kitchen/kitchen-bell.ts` — Bell sound effect
- `src/features/kitchen/kitchen-sync.ts` — Sync client for kitchen devices
- `src/features/kitchen/kitchen-handler.ts` — Main device data provider
- `src/features/kitchen/KitchenLoginPage.tsx` — Login/connection screen
- `src/features/kitchen/KitchenQueueView.tsx` — Kitchen staff order queue
- `src/features/kitchen/CustomerDisplayView.tsx` — Customer-facing display
- `src/pages/KitchenPage.tsx` — Route entry point

### Modified Files
- `src/db/schema.ts` — Added `kitchenDisplayEnabled` to Settings
- `src/db/appDb.ts` — Added v24 with `kitchenOrders` table + table declaration
- `src/features/sync/sync-types.ts` — Added kitchen sync endpoints
- `src/features/sync/sync-handler.ts` — Added kitchen order/status handlers
- `src/features/sync/local-sync-server.ts` — Added query/response pattern
- `src/features/sync/SyncSettingsPanel.tsx` — Register kitchen query handlers
- `src/features/admin/settings/AdminSettings.tsx` — Kitchen Display toggle
- `src/layout/AppShell.tsx` — Kitchen Display nav link
- `src/App.tsx` — `/kitchen` route

## Auto-Creating Kitchen Orders from POS Sales

To automatically send orders to the kitchen when a sale is made, add this call after saving an order:

```typescript
import { createKitchenOrderFromOrder } from "@/features/kitchen/kitchen-handler";

// After saving the POS order:
const settings = await db.settings.get("app");
if (settings?.kitchenDisplayEnabled) {
  await createKitchenOrderFromOrder(
    order.id,
    order.receiptNo,
    order.lines.map(l => ({ name: l.name, qty: l.qty })),
    "pos"
  );
}
```

For table orders:
```typescript
if (settings?.kitchenDisplayEnabled) {
  await createKitchenOrderFromOrder(
    tableOrder.id,
    tableOrder.receiptNo ?? 0,
    tableOrder.lines.map(l => ({ name: l.name, qty: l.qty })),
    "table",
    { tableNumber: tableOrder.tableNumber, waiterName: tableOrder.waiterName }
  );
}
```
