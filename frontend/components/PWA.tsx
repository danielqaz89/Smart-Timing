"use client";
import { useEffect } from "react";

export default function PWA() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((e) => console.warn("SW registration failed", e));
    }
  }, []);
  return null;
}
