package app.lovable.a89517294eb14219b1dd14af0464d470;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/**
 * Capacitor Plugin: Local HTTP Sync Server (Foreground Service version)
 *
 * Runs the sync server inside an Android Foreground Service so it stays
 * alive even when the screen is off — just like Zapya, SHAREit, etc.
 *
 * ─── SETUP ───────────────────────────────────────────────
 * 1. Add NanoHTTPD dependency in android/app/build.gradle:
 *      implementation 'org.nanohttpd:nanohttpd:2.3.1'
 *
 * 2. Copy these files to android/app/src/main/java/app/lovable/sangi/:
 *      - LocalSyncServerPlugin.java  (this file)
 *      - SyncForegroundService.java
 *
 * 3. Register in MainActivity.java:
 *      import app.lovable.sangi.LocalSyncServerPlugin;
 *      public class MainActivity extends BridgeActivity {
 *          @Override public void onCreate(Bundle savedInstanceState) {
 *              registerPlugin(LocalSyncServerPlugin.class);
 *              super.onCreate(savedInstanceState);
 *          }
 *      }
 *
 * 4. Add to AndroidManifest.xml:
 *      <uses-permission android:name="android.permission.INTERNET" />
 *      <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
 *      <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
 *      <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
 *      <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
 *      <uses-permission android:name="android.permission.WAKE_LOCK" />
 *
 *      Inside <application>:
 *      <service
 *          android:name=".SyncForegroundService"
 *          android:foregroundServiceType="dataSync"
 *          android:exported="false" />
 * ─────────────────────────────────────────────────────────
 */
@CapacitorPlugin(name = "LocalSyncServer")
public class LocalSyncServerPlugin extends Plugin {

    private static final String TAG = "LocalSyncServer";

    @Override
    public void load() {
        // Register as listener so the service can forward events to the web layer
        SyncForegroundService.syncDataListener = (endpoint, data) -> {
            JSObject eventData = new JSObject();
            eventData.put("endpoint", endpoint);
            eventData.put("data", data);
            eventData.put("timestamp", System.currentTimeMillis());
            notifyListeners("syncDataReceived", eventData);
        };
    }

    // ─── Start the server (as Foreground Service) ──────────

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", SyncForegroundService.DEFAULT_PORT);

        // Request POST_NOTIFICATIONS permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getActivity(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(),
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
            }
        }

        // Start the foreground service
        Intent intent = new Intent(getContext(), SyncForegroundService.class);
        intent.putExtra("port", port);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

        // Small delay to let service start, then respond
        getBridge().getActivity().getWindow().getDecorView().postDelayed(() -> {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("address", getLocalIpAddress());
            ret.put("port", port);
            call.resolve(ret);
        }, 300);
    }

    // ─── Stop the server ───────────────────────────────────

    @PluginMethod
    public void stopServer(PluginCall call) {
        Intent intent = new Intent(getContext(), SyncForegroundService.class);
        getContext().stopService(intent);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // ─── Get server status ─────────────────────────────────

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean running = SyncForegroundService.instance != null
                && SyncForegroundService.instance.isServerRunning();

        JSObject ret = new JSObject();
        ret.put("running", running);
        ret.put("address", getLocalIpAddress());
        ret.put("port", SyncForegroundService.DEFAULT_PORT);
        call.resolve(ret);
    }

    // ─── Get the last received sync data ───────────────────

    @PluginMethod
    public void getLastSyncData(PluginCall call) {
        SyncForegroundService svc = SyncForegroundService.instance;
        if (svc == null || svc.lastReceivedData == null) {
            call.reject("No sync data available");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("data", svc.lastReceivedData);
        ret.put("endpoint", svc.lastEndpoint);
        ret.put("timestamp", System.currentTimeMillis());
        call.resolve(ret);
    }

    // ─── Utility: get device's local IP ────────────────────

    private String getLocalIpAddress() {
        try {
            for (NetworkInterface intf : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InetAddress addr : Collections.list(intf.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to get IP", e);
        }
        return "0.0.0.0";
    }
}
