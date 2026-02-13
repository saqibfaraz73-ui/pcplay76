package app.lovable.sangi;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * Capacitor Plugin: Local HTTP Sync Server
 *
 * Runs a lightweight NanoHTTPD server on the Main device so Sub devices
 * can POST sales, credit entries, table orders, expenses, and print jobs
 * over the local WiFi / hotspot network.
 *
 * ─── SETUP ───────────────────────────────────────────────
 * 1. Add NanoHTTPD dependency in android/app/build.gradle:
 *      implementation 'org.nanohttpd:nanohttpd:2.3.1'
 *
 * 2. Copy this file to:
 *      android/app/src/main/java/app/lovable/sangi/LocalSyncServerPlugin.java
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
 * 4. Add internet permission in AndroidManifest.xml (usually already present):
 *      <uses-permission android:name="android.permission.INTERNET" />
 *      <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
 *      <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
 * ─────────────────────────────────────────────────────────
 */
@CapacitorPlugin(name = "LocalSyncServer")
public class LocalSyncServerPlugin extends Plugin {

    private static final String TAG = "LocalSyncServer";
    private static final int DEFAULT_PORT = 8942; // Sangi sync port

    private SyncHttpServer server;

    // ─── Start the server ──────────────────────────────────

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", DEFAULT_PORT);

        if (server != null && server.isAlive()) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("address", getLocalIpAddress());
            ret.put("port", port);
            call.resolve(ret);
            return;
        }

        try {
            server = new SyncHttpServer(port);
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("address", getLocalIpAddress());
            ret.put("port", port);
            call.resolve(ret);
        } catch (IOException e) {
            Log.e(TAG, "Failed to start server", e);
            call.reject("Failed to start sync server: " + e.getMessage());
        }
    }

    // ─── Stop the server ───────────────────────────────────

    @PluginMethod
    public void stopServer(PluginCall call) {
        if (server != null) {
            server.stop();
            server = null;
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // ─── Get server status ─────────────────────────────────

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", server != null && server.isAlive());
        ret.put("address", getLocalIpAddress());
        ret.put("port", DEFAULT_PORT);
        call.resolve(ret);
    }

    // ─── Get the last received sync data ───────────────────

    @PluginMethod
    public void getLastSyncData(PluginCall call) {
        if (server == null || server.lastReceivedData == null) {
            call.reject("No sync data available");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("data", server.lastReceivedData);
        ret.put("endpoint", server.lastEndpoint);
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

    // ═══════════════════════════════════════════════════════
    // Inner class: NanoHTTPD server
    // ═══════════════════════════════════════════════════════

    private class SyncHttpServer extends NanoHTTPD {

        String lastReceivedData = null;
        String lastEndpoint = null;

        SyncHttpServer(int port) {
            super(port);
        }

        @Override
        public Response serve(IHTTPSession session) {
            // CORS headers for all responses
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

            // ─── GET /ping — health check ──────────────
            if ("/ping".equals(uri) && Method.GET.equals(method)) {
                Response resp = newFixedLengthResponse(Response.Status.OK,
                        "application/json", "{\"status\":\"ok\",\"role\":\"main\"}");
                resp.addHeader("Access-Control-Allow-Origin", "*");
                return resp;
            }

            // ─── POST /sync/order — receive an order ───
            if ("/sync/order".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "order");
            }

            // ─── POST /sync/table-order — receive a table order ──
            if ("/sync/table-order".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "table-order");
            }

            // ─── POST /sync/credit-payment — receive credit payment ──
            if ("/sync/credit-payment".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "credit-payment");
            }

            // ─── POST /sync/expense — receive expense ──
            if ("/sync/expense".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "expense");
            }

            // ─── POST /sync/print — receive print job ──
            if ("/sync/print".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "print");
            }

            // ─── POST /sync/bulk — receive multiple items at once ──
            if ("/sync/bulk".equals(uri) && Method.POST.equals(method)) {
                return handleSyncPost(session, "bulk");
            }

            // 404 for unknown routes
            Response resp = newFixedLengthResponse(Response.Status.NOT_FOUND,
                    "application/json", "{\"error\":\"Not found\"}");
            resp.addHeader("Access-Control-Allow-Origin", "*");
            return resp;
        }

        private Response handleSyncPost(IHTTPSession session, String endpoint) {
            try {
                // Read request body
                Map<String, String> bodyMap = new java.util.HashMap<>();
                session.parseBody(bodyMap);
                String body = bodyMap.get("postData");

                if (body == null || body.isEmpty()) {
                    Response resp = newFixedLengthResponse(Response.Status.BAD_REQUEST,
                            "application/json", "{\"error\":\"Empty body\"}");
                    resp.addHeader("Access-Control-Allow-Origin", "*");
                    return resp;
                }

                // Store the data for the web layer to pick up
                lastReceivedData = body;
                lastEndpoint = endpoint;

                // Notify the web layer via bridge event
                JSObject eventData = new JSObject();
                eventData.put("endpoint", endpoint);
                eventData.put("data", body);
                eventData.put("timestamp", System.currentTimeMillis());
                notifyListeners("syncDataReceived", eventData);

                Log.d(TAG, "Received sync data on /" + endpoint + " (" + body.length() + " bytes)");

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
