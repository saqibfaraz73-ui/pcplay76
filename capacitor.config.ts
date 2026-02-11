import type { CapacitorConfig } from "@capacitor/cli";

// NOTE:
// - For production APKs we MUST NOT set `server.url`, otherwise the app becomes an online webview and can redirect
//   to Lovable/preview domains.
// - For local development (live-reload) you can set an env var before `npx cap run android`:
//     CAPACITOR_SERVER_URL=https://... npm run cap:android
//   (or whatever command you use).
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "app.lovable.a89517294eb14219b1dd14af0464d470",
  appName: "SANGI POS",
  webDir: "dist",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: true,
        },
      }
    : {}),
};

export default config;
