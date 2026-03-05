import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Native Android plugin for Network/WiFi thermal printer communication.
 * Sends raw ESC/POS data over TCP to printer's port 9100.
 * The native implementation must be added in:
 *   android/app/src/main/java/.../NetworkPrinterPlugin.java
 */
interface NetworkPrinterPlugin {
  connect(options: { ip: string; port?: number; timeout?: number }): Promise<{ success: boolean }>;
  disconnect(): Promise<{ success: boolean }>;
  isConnected(): Promise<{ connected: boolean }>;
  write(options: { data: string }): Promise<{ success: boolean }>;
  testConnection(options: { ip: string; port?: number; timeout?: number }): Promise<{ reachable: boolean; error?: string }>;
}

const NetworkPrinter = registerPlugin<NetworkPrinterPlugin>("NetworkPrinter");

let currentConnectedIp: string | null = null;
let currentConnectedPort: number = 9100;

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

/**
 * Test if a network printer is reachable at the given IP and port.
 */
export async function netTestConnection(ip: string, port = 9100): Promise<{ reachable: boolean; error?: string }> {
  if (!isNativeAndroid()) return { reachable: false, error: "Network printing requires the Android app." };
  try {
    return await NetworkPrinter.testConnection({ ip, port, timeout: 3000 });
  } catch (e: any) {
    return { reachable: false, error: e?.message ?? String(e) };
  }
}

/**
 * Connect to a network printer.
 */
export async function netConnect(ip: string, port = 9100): Promise<void> {
  if (!isNativeAndroid()) throw new Error("Network printing requires the Android app build.");

  // Skip if already connected to the same printer
  if (currentConnectedIp === ip && currentConnectedPort === port) {
    try {
      const status = await NetworkPrinter.isConnected();
      if (status?.connected) return;
    } catch {
      // Fall through to reconnect
    }
  }

  await NetworkPrinter.connect({ ip, port, timeout: 5000 });
  currentConnectedIp = ip;
  currentConnectedPort = port;
}

/**
 * Disconnect from the network printer.
 */
export async function netDisconnect(): Promise<void> {
  if (!isNativeAndroid()) throw new Error("Network printing requires the Android app build.");
  currentConnectedIp = null;
  await NetworkPrinter.disconnect();
}

/**
 * Send ESC/POS data to the connected network printer.
 */
export async function netSend(text: string): Promise<void> {
  if (!isNativeAndroid()) throw new Error("Network printing requires the Android app build.");

  const connected = await NetworkPrinter.isConnected();
  if (!connected?.connected) {
    // Try to auto-reconnect if we have the IP
    if (currentConnectedIp) {
      await netConnect(currentConnectedIp, currentConnectedPort);
    } else {
      throw new Error("Network printer disconnected. Please reconnect in Admin > Printer.");
    }
  }

  const data = base64FromRawBytes(text);
  await NetworkPrinter.write({ data });
}
