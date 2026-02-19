package app.lovable.a89517294eb14219b1dd14af0464d470;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import fi.iki.elonen.NanoHTTPD;

import org.json.JSONObject;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Map;

/**
 * Android Foreground Service for the Local Sync Server.
 *
 * Keeps the NanoHTTPD sync server alive even when the screen is off,
 * similar to how Zapya / SHAREit maintain their server.
 *
 * ─── SETUP ───────────────────────────────────────────────
 * 1. Copy this file to:
 *      android/app/src/main/java/app/lovable/sangi/SyncForegroundService.java
 *
 * 2. Add to AndroidManifest.xml inside <application>:
 *      <service
 *          android:name=".SyncForegroundService"
 *          android:foregroundServiceType="dataSync"
 *          android:exported="false" />
 *
 * 3. Add permissions in AndroidManifest.xml:
 *      <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
 *      <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
 *      <uses-permission android:name="android.permission.WAKE_LOCK" />
 *
 * 4. For Android 13+ (API 33), POST_NOTIFICATIONS permission is needed
 *    for the foreground notification. The plugin requests this automatically.
 * ─────────────────────────────────────────────────────────
 */
public class SyncForegroundService extends Service {

    private static final String TAG = "SyncFgService";
    private static final String CHANNEL_ID = "sangi_sync_channel";
    private static final int NOTIFICATION_ID = 9421;
    public static final int DEFAULT_PORT = 8942;

    private SyncHttpServer server;
    private PowerManager.WakeLock wakeLock;

    // Static reference so the plugin can read last data & send events
    static SyncForegroundService instance;

    // Callback interface for notifying the plugin
    interface SyncDataListener {
        void onSyncDataReceived(String endpoint, String data);
    }

    static SyncDataListener syncDataListener;

    // Last received data (for polling fallback)
    String lastReceivedData = null;
    String lastEndpoint = null;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int port = DEFAULT_PORT;
        if (intent != null) {
            port = intent.getIntExtra("port", DEFAULT_PORT);
        }

        // Show foreground notification
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);

        // Acquire partial wake lock to keep CPU active
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sangi:sync_server");
            wakeLock.acquire();
        }

        // Start the HTTP server
        if (server == null || !server.isAlive()) {
            try {
                server = new SyncHttpServer(port);
                server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
                Log.i(TAG, "Sync server started on port " + port);
            } catch (IOException e) {
                Log.e(TAG, "Failed to start sync server", e);
            }
        }

        // Restart if killed
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (server != null) {
            server.stop();
            server = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        instance = null;
        Log.i(TAG, "Sync server stopped");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Not a bound service
    }

    public boolean isServerRunning() {
        return server != null && server.isAlive();
    }

    // ─── Notification Channel (Android 8+) ─────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Sync Server",
                    NotificationManager.IMPORTANCE_LOW // Low = no sound, shows in tray
            );
            channel.setDescription("Keeps the sync server running for receiving data from other devices");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        // Tapping notification opens the app
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
                .setContentTitle("Sangi Sync Active")
                .setContentText("Receiving data from other devices")
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    // ═══════════════════════════════════════════════════════
    // Inner class: NanoHTTPD server (same logic, runs in service)
    // ═══════════════════════════════════════════════════════

    private class SyncHttpServer extends NanoHTTPD {

        SyncHttpServer(int port) {
            super(port);
        }

        @Override
        public Response serve(IHTTPSession session) {
            String corsHeaders = "Content-Type, Authorization";

            if (Method.OPTIONS.equals(session.getMethod())) {
                Response resp = newFixedLengthResponse(Response.Status.OK, "text/plain", "");
                resp.addHeader("Access-Control-Allow-Origin", "*");
                resp.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                resp.addHeader("Access-Control-Allow-Headers", corsHeaders);
                return resp;
            }

            String uri = session.getUri();
            Method method = session.getMethod();

            if ("/ping".equals(uri) && Method.GET.equals(method)) {
                Response resp = newFixedLengthResponse(Response.Status.OK,
                        "application/json", "{\"status\":\"ok\",\"role\":\"main\"}");
                resp.addHeader("Access-Control-Allow-Origin", "*");
                return resp;
            }

            if ("/sync/order".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "order");
            }
            if ("/sync/table-order".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "table-order");
            }
            if ("/sync/credit-payment".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "credit-payment");
            }
            if ("/sync/expense".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "expense");
            }
            if ("/sync/print".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "print");
            }
            if ("/sync/bulk".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "bulk");
            }

            Response resp = newFixedLengthResponse(Response.Status.NOT_FOUND,
                    "application/json", "{\"error\":\"Not found\"}");
            resp.addHeader("Access-Control-Allow-Origin", "*");
            return resp;
        }

        private Response handleSyncPost(IHTTPSession session, String endpoint) {
            try {
                Map<String, String> bodyMap = new java.util.HashMap<>();
                session.parseBody(bodyMap);
                String body = bodyMap.get("postData");

                if (body == null || body.isEmpty()) {
                    Response resp = newFixedLengthResponse(Response.Status.BAD_REQUEST,
                            "application/json", "{\"error\":\"Empty body\"}");
                    resp.addHeader("Access-Control-Allow-Origin", "*");
                    return resp;
                }

                // Store for polling
                lastReceivedData = body;
                lastEndpoint = endpoint;

                // Notify plugin via callback
                if (syncDataListener != null) {
                    syncDataListener.onSyncDataReceived(endpoint, body);
                }

                Log.d(TAG, "Received sync on /" + endpoint + " (" + body.length() + " bytes)");

                Response resp = newFixedLengthResponse(Response.Status.OK,
                        "application/json", "{\"success\":true,\"endpoint\":\"" + endpoint + "\"}");
                resp.addHeader("Access-Control-Allow-Origin", "*");
                return resp;

            } catch (Exception e) {
                Log.e(TAG, "Error handling sync POST", e);
                Response resp = newFixedLengthResponse(Response.Status.INTERNAL_ERROR,
                        "application/json", "{\"error\":\"" + e.getMessage() + "\"}");
                resp.addHeader("Access-Control-Allow-Origin", "*");
                return resp;
            }
        }
    }
}
