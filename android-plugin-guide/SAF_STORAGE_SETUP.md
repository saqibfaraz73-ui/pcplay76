# SAF Storage Plugin Setup Guide

## What is SAF?

Storage Access Framework (SAF) is the **modern Android way** to save files.

- ✅ **Zero storage permissions** needed in `AndroidManifest.xml`
- ✅ User picks a folder **once** → your app saves files there **forever**
- ✅ Works on Android 5.0+ (API 21+)
- ✅ Google Play approved — no special declarations needed

---

## Step 1 — Copy the Plugin File

Copy `SafStoragePlugin.java` to your Android project:

```
android/app/src/main/java/app/lovable/sangi/SafStoragePlugin.java
```

---

## Step 2 — Add Gradle Dependency

In `android/app/build.gradle`, inside `dependencies {}`:

```gradle
implementation "androidx.documentfile:documentfile:1.0.1"
```

---

## Step 3 — Register in MainActivity.java

```java
import app.lovable.sangi.SafStoragePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafStoragePlugin.class);
        // ... your other plugins
        super.onCreate(savedInstanceState);
    }
}
```

---

## Step 4 — Remove Storage Permissions from AndroidManifest.xml

Because SAF needs **zero permissions**, remove these lines:

```xml
<!-- REMOVE these — no longer needed with SAF -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
```

Keep these (still needed for other features):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- etc. -->
```

---

## Step 5 — How It Works for the User

**First time the user saves a file (backup, report, etc.):**

1. Android shows a folder picker: *"Choose where to save your Sangi POS files"*
2. User creates or selects a folder (e.g. `Downloads/Sangi Pos`)
3. Android grants permanent access — **never asks again**

**Every time after:**
- Files are saved silently directly to the chosen folder ✅

---

## Plugin Methods Reference

| Method | Description |
|--------|-------------|
| `openFolderPicker()` | Opens the system folder picker |
| `hasFolderAccess()` | Checks if a folder is already selected |
| `writeTextFile({ relativePath, contents })` | Writes a UTF-8 text/JSON file |
| `writeBinaryFile({ relativePath, base64Data, mimeType })` | Writes a PDF or image |
| `readTextFile({ relativePath })` | Reads a text file back |
| `getFileUri({ relativePath })` | Gets the `content://` URI for sharing |
| `listFiles({ relativePath })` | Lists files in a sub-folder |
| `deleteFile({ relativePath })` | Deletes a file |

---

## Updated AndroidManifest.xml (Clean Version)

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="app.lovable.a89517294eb14219b1dd14af0464d470">

    <!-- Internet & Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <!-- Bluetooth (Android 11 and below) -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

    <!-- Bluetooth / Nearby Devices (Android 12+) -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />

    <uses-feature android:name="android.hardware.bluetooth" android:required="false" />

    <!-- USB OTG -->
    <uses-feature android:name="android.hardware.usb.host" android:required="false" />

    <!-- Location (required for BT scan on Android < 12) -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <!-- NO storage permissions needed — SAF handles file access without them -->

    <!-- Camera (barcode scanning) -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />

    <!-- Foreground Service & System -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

    <!-- Notification (Android 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- AdMob -->
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:networkSecurityConfig="@xml/network_security_config">

        <!-- AdMob App ID -->
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="ca-app-pub-4619723552746870~3003839065" />

        <activity
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Sync Foreground Service -->
        <service
            android:name="app.lovable.sangi.SyncForegroundService"
            android:foregroundServiceType="dataSync"
            android:exported="false" />

        <!-- File Provider (still needed for camera, USB, etc.) -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

    </application>
</manifest>
```
