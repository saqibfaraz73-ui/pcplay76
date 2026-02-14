# Bluetooth Serial Printer Plugin — Setup Guide

## Step 1: Copy the Plugin File

Copy `BluetoothSerialPlugin.java` into your Android project at:
```
android/app/src/main/java/app/lovable/a89517294eb14219b1dd14af0464d470/BluetoothSerialPlugin.java
```

> **Note:** Make sure the `package` line matches your app's package name.

## Step 2: Register the Plugin in MainActivity

Open `android/app/src/main/java/.../MainActivity.java` and add **ALL THREE** plugins:

```java
import app.lovable.a89517294eb14219b1dd14af0464d470.UsbPrinterPlugin;
import app.lovable.a89517294eb14219b1dd14af0464d470.BluetoothSerialPlugin;
import app.lovable.sangi.LocalSyncServerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UsbPrinterPlugin.class);
        registerPlugin(BluetoothSerialPlugin.class);  // ← ADD THIS LINE
        registerPlugin(LocalSyncServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

## Step 3: Build & Run

```bash
npm run build
npx cap sync android
```

Then open Android Studio and run the app.

## How It Works

1. Go to **Admin → Printer** (or Printer from the menu)
2. Select **Bluetooth** as connection type
3. Tap **Refresh paired devices** — lists all Bluetooth devices paired in Android settings
4. Select your thermal printer from the list
5. Tap **Connect**
6. Print receipts as usual!

## Troubleshooting

- **"Bluetooth serial plugin not implemented"** → BluetoothSerialPlugin is not registered in MainActivity.java. Add `registerPlugin(BluetoothSerialPlugin.class);` 
- **No devices found** → Pair the printer first in Android Bluetooth settings
- **Connection failed** → Make sure the printer is turned on and within range
- **Permission denied** → Grant Bluetooth and Location permissions when prompted
