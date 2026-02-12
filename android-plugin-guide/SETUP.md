# USB OTG Printer Plugin — Setup Guide

## Step 1: Copy the Plugin File

Copy `UsbPrinterPlugin.java` into your Android project at:
```
android/app/src/main/java/app/lovable/sangipos/UsbPrinterPlugin.java
```

> **Note:** If your package name is different, update the `package` line at the top of the Java file.

## Step 2: Register the Plugin in MainActivity

Open `android/app/src/main/java/.../MainActivity.java` and add the plugin:

```java
import app.lovable.sangipos.UsbPrinterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UsbPrinterPlugin.class);
        // Also register BluetoothSerial if you have it:
        // registerPlugin(BluetoothSerialPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

## Step 3: Add USB Permissions to AndroidManifest.xml

Add inside `<manifest>`:
```xml
<uses-feature android:name="android.hardware.usb.host" android:required="false" />
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

1. Connect USB thermal printer to your phone via **OTG cable**
2. Go to **Admin → Printer**
3. Select **USB (OTG)** as connection type
4. Tap **Refresh USB devices**
5. Select your printer from the list
6. Tap **Connect** (grant USB permission when prompted)
7. Print receipts as usual!
