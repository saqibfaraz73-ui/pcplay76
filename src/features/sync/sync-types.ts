/**
 * Local P2P Sync — Type definitions
 *
 * Defines the protocol for Main ↔ Sub app communication over local hotspot.
 */

export type DeviceRole = "main" | "sub" | "none";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type SyncEndpoint =
  | "order"
  | "table-order"
  | "credit-payment"
  | "expense"
  | "print"
  | "work-period"
  | "bulk";

/** Payload sent from Sub → Main for each sync endpoint */
export type SyncPayload = {
  /** Which endpoint/type of data */
  endpoint: SyncEndpoint;
  /** The actual data (order, expense, etc.) — serialized from Dexie records */
  data: unknown;
  /** Sub device identifier (device ID from licensing) */
  sourceDeviceId: string;
  /** Timestamp when sent */
  sentAt: number;
};

/** Bulk sync payload: multiple items in a single request */
export type BulkSyncPayload = {
  endpoint: "bulk";
  items: Array<{
    endpoint: SyncEndpoint;
    data: unknown;
  }>;
  sourceDeviceId: string;
  sentAt: number;
};

/** Response from Main app server */
export type SyncResponse = {
  success: boolean;
  endpoint?: string;
  error?: string;
};

/** Print job payload sent from Sub → Main */
export type PrintJobPayload = {
  /** Base64-encoded ESC/POS raw bytes */
  printData: string;
  /** "bluetooth" | "usb" */
  printerType: "bluetooth" | "usb";
};

/** Connection configuration stored locally on each device */
export type SyncConfig = {
  role: DeviceRole;
  /** Main app's IP address (only needed on Sub devices) */
  mainAppIp?: string;
  /** Port number (default: 8942) */
  port: number;
  /** Friendly device name */
  deviceName?: string;
};

export const DEFAULT_SYNC_PORT = 8942;

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  role: "none",
  port: DEFAULT_SYNC_PORT,
};
