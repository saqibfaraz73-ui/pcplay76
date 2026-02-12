package app.lovable.a89517294eb14219b1dd14af0464d470;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;

@CapacitorPlugin(name = "UsbPrinter")
public class UsbPrinterPlugin extends Plugin {

    private static final String TAG = "UsbPrinterPlugin";
    private static final String ACTION_USB_PERMISSION = "app.lovable.a89517294eb14219b1dd14af0464d470.USB_PERMISSION";

    private UsbManager usbManager;
    private UsbDevice connectedDevice;
    private UsbDeviceConnection connection;
    private UsbEndpoint outEndpoint;
    private UsbInterface printerInterface;

    private PluginCall pendingPermissionCall;

    private final BroadcastReceiver usbPermissionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_USB_PERMISSION.equals(intent.getAction())) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

                    if (pendingPermissionCall != null) {
                        JSObject result = new JSObject();
                        result.put("granted", granted);
                        pendingPermissionCall.resolve(result);
                        pendingPermissionCall = null;
                    }
                }
            }
        }
    };

    @Override
    public void load() {
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbPermissionReceiver, filter);
        }
    }

    @PluginMethod
    public void listDevices(PluginCall call) {
        try {
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            JSArray devices = new JSArray();

            for (UsbDevice device : deviceList.values()) {
                // Filter for printer class (7) or show all for flexibility
                JSObject obj = new JSObject();
                obj.put("deviceName", device.getDeviceName());
                obj.put("vendorId", device.getVendorId());
                obj.put("productId", device.getProductId());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    obj.put("manufacturerName", device.getManufacturerName());
                    obj.put("productName", device.getProductName());
                }
                devices.put(obj);
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "listDevices error", e);
            call.reject("Failed to list USB devices: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String deviceName = call.getString("deviceName");
        if (deviceName == null || deviceName.isEmpty()) {
            call.reject("deviceName is required");
            return;
        }

        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        UsbDevice device = deviceList.get(deviceName);
        if (device == null) {
            call.reject("Device not found: " + deviceName);
            return;
        }

        if (usbManager.hasPermission(device)) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        pendingPermissionCall = call;
        PendingIntent permissionIntent = PendingIntent.getBroadcast(
                getContext(), 0,
                new Intent(ACTION_USB_PERMISSION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        usbManager.requestPermission(device, permissionIntent);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String deviceName = call.getString("deviceName");
        if (deviceName == null || deviceName.isEmpty()) {
            call.reject("deviceName is required");
            return;
        }

        // Disconnect existing connection first
        disconnectInternal();

        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        UsbDevice device = deviceList.get(deviceName);
        if (device == null) {
            call.reject("Device not found: " + deviceName);
            return;
        }

        if (!usbManager.hasPermission(device)) {
            call.reject("USB permission not granted. Call requestPermission first.");
            return;
        }

        try {
            // Find printer interface (class 7 = Printer) or bulk out endpoint
            UsbInterface iface = null;
            UsbEndpoint endpoint = null;

            for (int i = 0; i < device.getInterfaceCount(); i++) {
                UsbInterface ui = device.getInterface(i);
                // Printer class = 7, or look for bulk out endpoint
                for (int j = 0; j < ui.getEndpointCount(); j++) {
                    UsbEndpoint ep = ui.getEndpoint(j);
                    if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                            && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                        iface = ui;
                        endpoint = ep;
                        break;
                    }
                }
                if (endpoint != null) break;
            }

            if (iface == null || endpoint == null) {
                call.reject("No suitable printer endpoint found on this USB device.");
                return;
            }

            UsbDeviceConnection conn = usbManager.openDevice(device);
            if (conn == null) {
                call.reject("Failed to open USB device connection.");
                return;
            }

            if (!conn.claimInterface(iface, true)) {
                conn.close();
                call.reject("Failed to claim USB interface.");
                return;
            }

            connectedDevice = device;
            connection = conn;
            printerInterface = iface;
            outEndpoint = endpoint;

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "connect error", e);
            call.reject("Failed to connect: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectInternal();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", connection != null && connectedDevice != null);
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String dataBase64 = call.getString("data");
        if (dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("data is required (base64 encoded)");
            return;
        }

        if (connection == null || outEndpoint == null) {
            call.reject("Not connected to any USB printer.");
            return;
        }

        try {
            byte[] data = Base64.decode(dataBase64, Base64.DEFAULT);

            // Send in chunks (max packet size)
            int chunkSize = outEndpoint.getMaxPacketSize();
            if (chunkSize <= 0) chunkSize = 64;

            int offset = 0;
            while (offset < data.length) {
                int length = Math.min(chunkSize, data.length - offset);
                byte[] chunk = new byte[length];
                System.arraycopy(data, offset, chunk, 0, length);

                int sent = connection.bulkTransfer(outEndpoint, chunk, chunk.length, 5000);
                if (sent < 0) {
                    call.reject("USB bulk transfer failed at offset " + offset);
                    return;
                }
                offset += length;
            }

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "write error", e);
            call.reject("Failed to write: " + e.getMessage());
        }
    }

    private void disconnectInternal() {
        try {
            if (connection != null && printerInterface != null) {
                connection.releaseInterface(printerInterface);
            }
            if (connection != null) {
                connection.close();
            }
        } catch (Exception e) {
            Log.e(TAG, "disconnect error", e);
        }
        connection = null;
        connectedDevice = null;
        outEndpoint = null;
        printerInterface = null;
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(usbPermissionReceiver);
        } catch (Exception ignored) {}
        disconnectInternal();
    }
}
