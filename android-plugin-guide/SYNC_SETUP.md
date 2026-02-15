# Local P2P Sync — Android Setup Guide

## Overview

This enables two Sangi POS apps to sync data over a local WiFi/hotspot connection:
- **Main Device**: Runs a local HTTP server (as a Foreground Service), receives data from sub devices, has the printer
- **Sub Device**: Sends sales, orders, expenses to Main device, uses Main's printer

The sync server runs as an **Android Foreground Service** with a wake lock, so it stays alive even when the screen is off — just like Zapya, SHAREit, and other sharing apps.

## Architecture

```
[Sub App] ──HTTP POST over WiFi/Hotspot──▶ [Main App (Foreground Service + NanoHTTPD)]
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

### 2. Copy plugin files

Copy **both** files to:
```
android/app/src/main/java/app/lovable/sangi/LocalSyncServerPlugin.java
android/app/src/main/java/app/lovable/sangi/SyncForegroundService.java
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
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### 5. Register the Foreground Service in AndroidManifest.xml

Inside the `<application>` tag:

```xml
<service
    android:name=".SyncForegroundService"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

### 6. Build and sync

```bash
npm run build
npx cap sync android
```

## How the Foreground Service Works

When the Main device starts the sync server:

1. **Foreground Service** starts with a persistent notification ("Sangi Sync Active")
2. **Partial Wake Lock** is acquired — keeps CPU running even with screen off
3. **NanoHTTPD** server runs inside the service, listening on port 8942
4. **START_STICKY** flag ensures Android restarts the service if it's killed

This means:
- ✅ Screen off → server keeps running
- ✅ App in background → server keeps running
- ✅ Low memory → Android restarts the service automatically
- ✅ Notification shows sync is active (user can tap to return to app)

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
2. A persistent notification appears: "Sangi Sync Active — Receiving data from other devices"
3. **Sub device** enters the Main's IP address → connects
4. When Sub device creates a sale/order/expense:
   - Data is saved locally on the Sub device
   - Data is also sent via HTTP to the Main device
   - Main device saves it to its own database (even with screen off!)
5. When Sub device wants to print:
   - Print data (ESC/POS commands) is sent to Main device
   - Main device forwards it to the connected USB/Bluetooth printer

## Port

Default port: **8942** (configurable in settings)

## Troubleshooting

- **Can't connect**: Ensure both devices are on the same WiFi/hotspot
- **Hotspot IP**: Usually `192.168.43.1` for the hotspot host device
- **Firewall**: Some custom ROMs may block local network connections
- **Screen off not working**: Verify the foreground service notification is visible in the notification tray
- **Android 13+**: The app will request notification permission on first server start — make sure to allow it
- **Battery optimization**: Go to Settings → Battery → App → Sangi → set to "Unrestricted" to prevent Android from killing the service
