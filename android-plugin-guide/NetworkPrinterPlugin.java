package app.lovable.a89517294eb14219b1dd14af0464d470;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import android.util.Base64;

/**
 * Capacitor plugin for Network/WiFi thermal printer communication.
 * Sends raw ESC/POS data over TCP to printer's port 9100 (standard RAW printing port).
 *
 * SETUP:
 * 1. Copy this file to: android/app/src/main/java/app/lovable/sangipos/NetworkPrinterPlugin.java
 * 2. Register in MainActivity.java:
 *      import app.lovable.sangipos.NetworkPrinterPlugin;
 *      public class MainActivity extends BridgeActivity {
 *          @Override public void onCreate(Bundle savedInstanceState) {
 *              registerPlugin(NetworkPrinterPlugin.class);
 *              super.onCreate(savedInstanceState);
 *          }
 *      }
 * 3. Add to AndroidManifest.xml:
 *      <uses-permission android:name="android.permission.INTERNET" />
 *      (usually already present)
 */
@CapacitorPlugin(name = "NetworkPrinter")
public class NetworkPrinterPlugin extends Plugin {

    private Socket socket;
    private OutputStream outputStream;
    private String connectedIp;
    private int connectedPort;

    @PluginMethod
    public void connect(PluginCall call) {
        String ip = call.getString("ip", "");
        int port = call.getInt("port", 9100);
        int timeout = call.getInt("timeout", 5000);

        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }

        new Thread(() -> {
            try {
                // Close existing connection if any
                closeSocket();

                socket = new Socket();
                socket.connect(new InetSocketAddress(ip, port), timeout);
                socket.setSoTimeout(timeout);
                outputStream = socket.getOutputStream();
                connectedIp = ip;
                connectedPort = port;

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Connection failed: " + e.getMessage(), e);
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            closeSocket();
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Disconnect failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", socket != null && socket.isConnected() && !socket.isClosed());
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.isEmpty()) {
            call.reject("No data to write");
            return;
        }

        new Thread(() -> {
            try {
                if (socket == null || socket.isClosed() || outputStream == null) {
                    // Try to reconnect if we have previous connection info
                    if (connectedIp != null && !connectedIp.isEmpty()) {
                        socket = new Socket();
                        socket.connect(new InetSocketAddress(connectedIp, connectedPort), 5000);
                        socket.setSoTimeout(5000);
                        outputStream = socket.getOutputStream();
                    } else {
                        call.reject("Not connected to any printer");
                        return;
                    }
                }

                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                outputStream.write(bytes);
                outputStream.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                // Reset connection on write failure
                closeSocket();
                call.reject("Write failed: " + e.getMessage(), e);
            }
        }).start();
    }

    /**
     * Test connectivity to a printer IP without keeping the connection open.
     */
    @PluginMethod
    public void testConnection(PluginCall call) {
        String ip = call.getString("ip", "");
        int port = call.getInt("port", 9100);
        int timeout = call.getInt("timeout", 3000);

        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }

        new Thread(() -> {
            Socket testSocket = null;
            try {
                testSocket = new Socket();
                testSocket.connect(new InetSocketAddress(ip, port), timeout);
                JSObject result = new JSObject();
                result.put("reachable", true);
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("reachable", false);
                result.put("error", e.getMessage());
                call.resolve(result);
            } finally {
                try {
                    if (testSocket != null) testSocket.close();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void closeSocket() {
        try {
            if (outputStream != null) {
                outputStream.close();
                outputStream = null;
            }
            if (socket != null) {
                socket.close();
                socket = null;
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        closeSocket();
        super.handleOnDestroy();
    }
}
