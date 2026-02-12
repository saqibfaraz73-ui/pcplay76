import { Capacitor, registerPlugin } from "@capacitor/core";

export type UsbDevice = {
  deviceName: string;
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
};

/**
 * Native Android plugin for USB OTG thermal printer communication.
 * The native implementation must be added in:
 *   android/app/src/main/java/.../UsbPrinterPlugin.java
 */
interface UsbPrinterPlugin {
  listDevices(): Promise<{ devices: UsbDevice[] }>;
  requestPermission(options: { deviceName: string }): Promise<{ granted: boolean }>;
  connect(options: { deviceName: string }): Promise<{ success: boolean }>;
  disconnect(): Promise<{ success: boolean }>;
  isConnected(): Promise<{ connected: boolean }>;
  write(options: { data: string }): Promise<{ success: boolean }>;
}

const UsbPrinter = registerPlugin<UsbPrinterPlugin>("UsbPrinter");

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function base64FromRawBytes(text: string): string {
  let binary = "";
  for (let i = 0; i < text.length; i++) {
    binary += String.fromCharCode(text.charCodeAt(i) & 0xff);
  }
  const btoaFn = (globalThis as any).btoa as ((s: string) => string) | undefined;
  if (!btoaFn) throw new Error("Base64 encoder (btoa) not available.");
  return btoaFn(binary);
}

export async function usbListDevices(): Promise<UsbDevice[]> {
  if (!isNativeAndroid()) return [];
  try {
    const res = await UsbPrinter.listDevices();
    return res.devices ?? [];
  } catch (e) {
    console.error("USB list devices error:", e);
    return [];
  }
}

export async function usbRequestPermission(deviceName: string): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await UsbPrinter.requestPermission({ deviceName });
    return res.granted;
  } catch (e) {
    console.error("USB permission error:", e);
    return false;
  }
}

export async function usbConnect(deviceName: string): Promise<void> {
  if (!isNativeAndroid()) throw new Error("USB printing requires the Android app.");
  const granted = await usbRequestPermission(deviceName);
  if (!granted) throw new Error("USB permission denied. Please allow USB access and try again.");
  await UsbPrinter.connect({ deviceName });
}

export async function usbDisconnect(): Promise<void> {
  if (!isNativeAndroid()) throw new Error("USB printing requires the Android app.");
  await UsbPrinter.disconnect();
}

export async function usbSend(text: string): Promise<void> {
  if (!isNativeAndroid()) throw new Error("USB printing requires the Android app.");
  const connected = await UsbPrinter.isConnected();
  if (!connected?.connected) {
    throw new Error("USB printer disconnected. Please reconnect in Admin > Printer.");
  }
  const data = base64FromRawBytes(text);
  await UsbPrinter.write({ data });
}
