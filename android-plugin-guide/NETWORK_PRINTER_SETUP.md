# Network / WiFi Printer Setup

## Overview
The NetworkPrinter plugin enables printing to thermal receipt printers connected via WiFi or Ethernet (LAN). It sends raw ESC/POS data over TCP to the printer's standard port 9100.

## Requirements
- Printer must be connected to the same WiFi/LAN network as the Android device
- Printer must support RAW printing on port 9100 (most thermal printers do)
- Android device needs `INTERNET` permission (usually already in manifest)

## Setup Steps

### 1. Copy the Plugin
Copy `NetworkPrinterPlugin.java` to:
```
android/app/src/main/java/app/lovable/sangipos/NetworkPrinterPlugin.java
```

### 2. Register in MainActivity
```java
import app.lovable.sangipos.NetworkPrinterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NetworkPrinterPlugin.class);
        // ... other plugins
        super.onCreate(savedInstanceState);
    }
}
```

### 3. AndroidManifest.xml
Ensure this permission exists (usually already present):
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## Finding Your Printer's IP Address
1. Print a network configuration page from the printer (usually hold Feed button for 5 seconds)
2. Or check your router's connected devices list
3. Common default IPs: `192.168.1.x`, `192.168.0.x`

## Supported Printers
Any thermal receipt printer with network connectivity that supports RAW printing on port 9100:
- Epson TM series (WiFi/Ethernet models)
- Star TSP series
- Xprinter XP-N160II, XP-Q200, etc.
- Any ESC/POS compatible network printer

## Troubleshooting
- **Cannot connect**: Ensure printer and device are on the same network
- **Connection timeout**: Check printer IP and that port 9100 is not blocked by firewall
- **Garbled output**: Ensure printer supports ESC/POS commands
- **Intermittent failures**: Some printers close idle connections; the plugin auto-reconnects
