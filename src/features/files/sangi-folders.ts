import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const SANGI_ROOT = "Sangi Pos";

export type SangiFolder = "Backup" | "Sales Report" | "Credit" | "Images";

export function folderPath(folder: SangiFolder) {
  return `${SANGI_ROOT}/${folder}`;
}

export async function ensureSangiFolders() {
  // In web, Capacitor uses an internal filesystem (IndexedDB). On Android, this maps to app storage.
  const targets: SangiFolder[] = ["Backup", "Sales Report", "Credit", "Images"];
  for (const f of targets) {
    try {
      await Filesystem.mkdir({ directory: Directory.Documents, path: folderPath(f), recursive: true });
    } catch {
      // ignore if exists or unsupported
    }
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function readPdfBlobUrl(args: { path: string }) {
  // Reads a previously-written PDF (stored as base64) and returns a Blob URL usable in webviews.
  const res = await Filesystem.readFile({ directory: Directory.Documents, path: args.path });

  const blob =
    typeof res.data === "string"
      ? (() => {
          const bytes = base64ToUint8(res.data);
          // Avoid TS friction around SharedArrayBuffer by passing an ArrayBuffer.
          const ab = bytes.buffer.slice(0) as ArrayBuffer;
          return new Blob([ab], { type: "application/pdf" });
        })()
      : res.data;

  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

export async function writeTextFile(args: { folder: SangiFolder; fileName: string; contents: string }) {
  await ensureSangiFolders();
  const path = `${folderPath(args.folder)}/${args.fileName}`;
  await Filesystem.writeFile({
    directory: Directory.Documents,
    path,
    data: args.contents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const uri = await Filesystem.getUri({ directory: Directory.Documents, path });
  return { path, uri: uri.uri };
}

export async function writePdfFile(args: { folder: SangiFolder; fileName: string; pdfBytes: Uint8Array }) {
  await ensureSangiFolders();
  const path = `${folderPath(args.folder)}/${args.fileName}`;
  await Filesystem.writeFile({
    directory: Directory.Documents,
    path,
    data: uint8ToBase64(args.pdfBytes),
    recursive: true,
  });
  const uri = await Filesystem.getUri({ directory: Directory.Documents, path });
  return { path, uri: uri.uri };
}

export async function shareFile(args: { title: string; uri: string }) {
  await Share.share({ title: args.title, url: args.uri, dialogTitle: args.title });
}
