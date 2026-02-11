import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensureSangiFolders } from "@/features/files/sangi-folders";

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

createRoot(document.getElementById("root")!).render(<App />);
