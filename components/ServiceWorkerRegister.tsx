"use client";

import { useEffect } from "react";

/**
 * Registers the AthleteOS service worker in production builds only.
 * Install/update UX lives in PwaProvider (added separately).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failures should not break the app shell.
    });
  }, []);

  return null;
}
