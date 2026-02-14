package app.lovable.a89517294eb14219b1dd14af0464d470;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothSerial",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            }
        )
    }
)
public class BluetoothSerialPlugin extends Plugin {

    private static final String TAG = "BluetoothSerialPlugin";
    // Standard SPP UUID for serial port profile
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket socket;
    private OutputStream outputStream;

    @Override
    public void load() {
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ needs BLUETOOTH_CONNECT and BLUETOOTH_SCAN
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
                return;
            }
        } else {
            // Android 11 and below
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
                return;
            }
        }
        JSObject result = new JSObject();
        result.put("granted", true);
        call.resolve(result);
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        } else {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject result = new JSObject();
        boolean enabled = bluetoothAdapter != null && bluetoothAdapter.isEnabled();
        result.put("success", enabled);
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void listPairedDevices(PluginCall call) {
        JSArray devices = new JSArray();

        if (bluetoothAdapter == null) {
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    call.reject("BLUETOOTH_CONNECT permission not granted");
                    return;
                }
            }

            Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
            if (pairedDevices != null) {
                for (BluetoothDevice device : pairedDevices) {
                    JSObject obj = new JSObject();
                    obj.put("name", device.getName());
                    obj.put("address", device.getAddress());
                    obj.put("class", device.getBluetoothClass().getMajorDeviceClass());
                    devices.put(obj);
                }
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException e) {
            Log.e(TAG, "Security exception listing paired devices", e);
            call.reject("Bluetooth permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("address is required");
            return;
        }

        // Disconnect existing connection first
        disconnectInternal();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    call.reject("BLUETOOTH_CONNECT permission not granted");
                    return;
                }
            }

            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);

            // Cancel discovery to speed up connection
            try {
                bluetoothAdapter.cancelDiscovery();
            } catch (SecurityException ignored) {}

            socket.connect();
            outputStream = socket.getOutputStream();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (SecurityException e) {
            Log.e(TAG, "Security exception connecting", e);
            disconnectInternal();
            call.reject("Bluetooth permission denied: " + e.getMessage());
        } catch (IOException e) {
            Log.e(TAG, "Connection failed", e);
            disconnectInternal();
            call.reject("Could not connect to printer: " + e.getMessage());
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
        boolean connected = socket != null && socket.isConnected();
        JSObject result = new JSObject();
        result.put("success", connected);
        result.put("connected", connected);
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String dataBase64 = call.getString("data");
        if (dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("data is required (base64 encoded)");
            return;
        }

        if (outputStream == null || socket == null || !socket.isConnected()) {
            call.reject("Not connected to any Bluetooth printer.");
            return;
        }

        try {
            byte[] data = Base64.decode(dataBase64, Base64.DEFAULT);
            outputStream.write(data);
            outputStream.flush();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (IOException e) {
            Log.e(TAG, "Write failed", e);
            call.reject("Failed to write: " + e.getMessage());
        }
    }

    private void disconnectInternal() {
        try {
            if (outputStream != null) {
                outputStream.close();
            }
        } catch (IOException ignored) {}
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (IOException ignored) {}
        outputStream = null;
        socket = null;
    }

    @Override
    protected void handleOnDestroy() {
        disconnectInternal();
    }
}
