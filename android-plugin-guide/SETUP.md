# USB OTG Printer Plugin — Setup Guide

## Step 1: Copy the Plugin Files

Copy **all three** plugin files into your Android project at:
```
android/app/src/main/java/app/lovable/a89517294eb14219b1dd14af0464d470/UsbPrinterPlugin.java
android/app/src/main/java/app/lovable/a89517294eb14219b1dd14af0464d470/BluetoothSerialPlugin.java
android/app/src/main/java/app/lovable/sangi/LocalSyncServerPlugin.java
```

> **Note:** If your package name is different, update the `package` line at the top of each Java file.

## Step 2: Register ALL Plugins in MainActivity

Open `android/app/src/main/java/.../MainActivity.java` and add **all three** plugins:

```java
import app.lovable.a89517294eb14219b1dd14af0464d470.UsbPrinterPlugin;
import app.lovable.a89517294eb14219b1dd14af0464d470.BluetoothSerialPlugin;
import app.lovable.sangi.LocalSyncServerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UsbPrinterPlugin.class);
        registerPlugin(BluetoothSerialPlugin.class);
        registerPlugin(LocalSyncServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

## Step 3: Add Permissions to AndroidManifest.xml

Add inside `<manifest>`:
```xml
<uses-feature android:name="android.hardware.usb.host" android:required="false" />
<uses-feature android:name="android.hardware.bluetooth" android:required="false" />
```

## Step 4: Build & Run

```bash
npm run build
npx cap sync android
```

Then open Android Studio and run the app, or:
```bash
npx cap run android
```

## Usage in the App

### USB Printer
1. Connect USB thermal printer to your phone via **OTG cable**
2. Go to **Printer** (from menu)
3. Select **USB (OTG)** as connection type
4. Tap **Refresh USB devices**
5. Select your printer from the list
6. Tap **Connect** (grant USB permission when prompted)

### Bluetooth Printer
1. Pair the printer in **Android Bluetooth settings** first
2. Go to **Printer** (from menu)
3. Select **Bluetooth** as connection type
4. Tap **Refresh paired devices**
5. Select your printer from the list
6. Tap **Connect**
