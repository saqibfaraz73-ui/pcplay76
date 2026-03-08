import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensureSangiFolders } from "@/features/files/sangi-folders";
import { setCurrencySymbol } from "@/features/pos/format";
import { db } from "@/db/appDb";
import { getRemoteConfig } from "@/features/licensing/remote-config";

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
    event.preventDefault();
  });
  window.addEventListener("error", (event) => {
    console.error("Global error:", event.error);
  });
}

ensureSangiFolders().catch(() => {});
// Pre-fetch remote config (ad IDs, free limits) from GitHub Gist
getRemoteConfig().catch(() => {});

// Load currency symbol early so formatIntMoney works everywhere
db.settings.get("app").then((s) => {
  if (s?.currencySymbol) setCurrencySymbol(s.currencySymbol);
}).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
