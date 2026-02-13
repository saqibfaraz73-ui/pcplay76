# Local P2P Sync — Android Setup Guide

## Overview

This enables two Sangi POS apps to sync data over a local WiFi/hotspot connection:
- **Main Device**: Runs a local HTTP server, receives data from sub devices, has the printer
- **Sub Device**: Sends sales, orders, expenses to Main device, uses Main's printer

## Architecture

```
[Sub App] ──HTTP POST over WiFi/Hotspot──▶ [Main App (NanoHTTPD Server)]
                                                    │
                                               [Dexie DB]
                                                    │
                                            [USB/BT Printer]
```

## Setup Steps

### 1. Add NanoHTTPD dependency

In `android/app/build.gradle`, add:

```gradle
dependencies {
    // ... existing dependencies
    implementation 'org.nanohttpd:nanohttpd:2.3.1'
}
```

### 2. Copy the plugin file

Copy `LocalSyncServerPlugin.java` to:
```
android/app/src/main/java/app/lovable/sangi/LocalSyncServerPlugin.java
```

### 3. Register the plugin

In `android/app/src/main/java/.../MainActivity.java`:

```java
import app.lovable.sangi.LocalSyncServerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalSyncServerPlugin.class);
        // ... other plugin registrations
        super.onCreate(savedInstanceState);
    }
}
```

### 4. Add permissions to AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 5. Build and sync

```bash
npm run build
npx cap sync android
```

## API Endpoints

| Method | Path                  | Description                    |
|--------|-----------------------|--------------------------------|
| GET    | `/ping`               | Health check                   |
| POST   | `/sync/order`         | Receive a POS order            |
| POST   | `/sync/table-order`   | Receive a table order          |
| POST   | `/sync/credit-payment`| Receive a credit payment       |
| POST   | `/sync/expense`       | Receive an expense record      |
| POST   | `/sync/print`         | Forward print job to printer   |
| POST   | `/sync/bulk`          | Multiple items in one request  |

## How It Works

1. **Main device** starts the sync server → shows its IP address on screen
2. **Sub device** enters the Main's IP address → connects
3. When Sub device creates a sale/order/expense:
   - Data is saved locally on the Sub device
   - Data is also sent via HTTP to the Main device
   - Main device saves it to its own database
4. When Sub device wants to print:
   - Print data (ESC/POS commands) is sent to Main device
   - Main device forwards it to the connected USB/Bluetooth printer

## Port

Default port: **8942** (configurable in settings)

## Troubleshooting

- **Can't connect**: Ensure both devices are on the same WiFi/hotspot
- **Hotspot IP**: Usually `192.168.43.1` for the hotspot host device
- **Firewall**: Some custom ROMs may block local network connections
