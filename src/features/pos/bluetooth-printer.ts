import { Capacitor, registerPlugin } from "@capacitor/core";

export type PairedBluetoothDevice = {
  name: string | null;
  address: string;
  class?: number;
};

// Native Android implementation lives in capacitor-overrides/BluetoothSerialPlugin.java
// NOTE: The native plugin uses these method names:
// - isEnabled() -> { success: boolean }
// - listPairedDevices() -> { devices: { name, address }[] }
// - connect({ address })
// - disconnect()
// - isConnected() -> { success: boolean }
// - write({ data: base64String })
interface BluetoothSerialPlugin {
  requestPermissions(): Promise<{ granted: boolean }>;
  isEnabled(): Promise<{ success?: boolean; enabled?: boolean }>;
  listPairedDevices(): Promise<{ devices: PairedBluetoothDevice[] }>;
  connect(options: { address: string }): Promise<{ success?: boolean } | void>;
  disconnect(): Promise<{ success?: boolean } | void>;
  isConnected(): Promise<{ success?: boolean; connected?: boolean }>;
  write(options: { data: string }): Promise<{ success?: boolean } | void>;
}

// Register the plugin - will use native implementation when available
const BluetoothSerial = registerPlugin<BluetoothSerialPlugin>("BluetoothSerial");

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function getEnabledFlag(res: { success?: boolean; enabled?: boolean } | undefined) {
  // Backward/forward compatibility: some variants might return { enabled }, ours returns { success }
  return Boolean(res?.enabled ?? res?.success);
}

function base64FromRawBytes(text: string): string {
  // ESC/POS commands use raw byte values (e.g., \x1b = 27, \x1d = 29)
  // We must NOT use TextEncoder as it converts to UTF-8 which corrupts control characters
  // Instead, treat each character as a raw byte value
  let binary = "";
  for (let i = 0; i < text.length; i++) {
    binary += String.fromCharCode(text.charCodeAt(i) & 0xff);
  }
  const btoaFn = (globalThis as any).btoa as ((s: string) => string) | undefined;
  if (!btoaFn) throw new Error("Base64 encoder (btoa) not available in this environment.");
  return btoaFn(binary);
}

export async function btRequestPermissions(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const result = await BluetoothSerial.requestPermissions();
    return result.granted;
  } catch (e) {
    console.error("Permission request failed:", e);
    return false;
  }
}

export async function btInitialize() {
  if (!isNativeAndroid()) throw new Error("Bluetooth printing requires the Android app build.");

  // Request permissions first (Android 12+)
  await btRequestPermissions();

  const result = await BluetoothSerial.isEnabled();
  if (!getEnabledFlag(result)) {
    throw new Error("Bluetooth is OFF. Please enable Bluetooth in Android Settings and try again.");
  }
}

// Kept for API compatibility with the Admin UI; Android 12+ generally does not allow enabling
// Bluetooth silently, so we guide the user to enable it via system settings.
export async function btEnable() {
  await btInitialize();
}

export async function btGetPairedDevices(): Promise<PairedBluetoothDevice[]> {
  if (!isNativeAndroid()) return [];

  try {
    await btInitialize();
    const res = await BluetoothSerial.listPairedDevices();
    return res.devices ?? [];
  } catch (e) {
    console.error("Failed to get paired devices:", e);
    return [];
  }
}

export async function btConnect(address: string) {
  if (!isNativeAndroid()) throw new Error("Bluetooth printing requires the Android app build.");
  await btInitialize();
  await BluetoothSerial.connect({ address });
}

export async function btDisconnect() {
  if (!isNativeAndroid()) throw new Error("Bluetooth printing requires the Android app build.");
  await BluetoothSerial.disconnect();
}

export async function btSend(text: string) {
  if (!isNativeAndroid()) throw new Error("Bluetooth printing requires the Android app build.");

  // Check if still connected
  const connected = await BluetoothSerial.isConnected();
  if (!connected?.success && !connected?.connected) {
    throw new Error("Printer disconnected. Please reconnect in Admin > Printer.");
  }

  // For small payloads (normal receipts without logo), send in one shot — this
  // is how it always worked and is reliable for the sales dashboard etc.
  // Only use chunked sending for large payloads (>2KB, typically logo data)
  // to prevent Bluetooth buffer overflow.
  const LARGE_THRESHOLD = 2048;

  if (text.length <= LARGE_THRESHOLD) {
    const data = base64FromRawBytes(text);
    await BluetoothSerial.write({ data });
    return;
  }

  // Chunked sending for large payloads (logo images etc.)
  const CHUNK_SIZE = 192;
  const CHUNK_DELAY = 120;

  for (let offset = 0; offset < text.length; offset += CHUNK_SIZE) {
    const chunk = text.slice(offset, offset + CHUNK_SIZE);
    const data = base64FromRawBytes(chunk);
    await BluetoothSerial.write({ data });
    if (offset + CHUNK_SIZE < text.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY));
    }
  }
}
