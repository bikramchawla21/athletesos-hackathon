"use client";

import { useEffect, useState } from "react";
import {
  type BeforeInstallPromptLike,
  isIosLikeUserAgent,
  isStandaloneDisplayMode,
  readInstallDismissed,
  shouldShowAndroidInstallAction,
  shouldShowIosInstallHelp,
  writeInstallDismissed,
} from "@/lib/pwa";

/**
 * Registers the service worker (production only), surfaces update + install UX.
 */
export function PwaProvider() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptLike | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    setIsStandalone(
      isStandaloneDisplayMode(
        (query) => window.matchMedia(query).matches,
        window.navigator as Navigator & { standalone?: boolean },
      ),
    );
    setIsIos(isIosLikeUserAgent(window.navigator.userAgent));
    setDismissed(readInstallDismissed(window.localStorage));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptLike);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;

        const trackWaiting = (worker: ServiceWorker | null | undefined) => {
          if (!worker) return;
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(worker);
            setUpdateReady(true);
          }
        };

        trackWaiting(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(installing);
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        // Registration failures should not break the app shell.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const showAndroidInstall = shouldShowAndroidInstallAction({
    isStandalone,
    hasDeferredPrompt: Boolean(deferredPrompt),
    dismissed,
  });

  const showIosEntry =
    !isStandalone && isIos && !dismissed && !showAndroidInstall;

  const showIosHelp = shouldShowIosInstallHelp({
    isStandalone,
    isIos,
    helpRequested: iosHelpOpen,
  });

  async function onInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
      writeInstallDismissed(window.localStorage);
      setDismissed(true);
    }
  }

  function onDismissInstall() {
    writeInstallDismissed(window.localStorage);
    setDismissed(true);
    setIosHelpOpen(false);
  }

  function onApplyUpdate() {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    setUpdateReady(false);
    // User-initiated reload only — never auto-refresh while composing.
    window.location.reload();
  }

  if (!updateReady && !showAndroidInstall && !showIosEntry && !showIosHelp) {
    return null;
  }

  return (
    <div className="pwa-chrome" role="region" aria-label="App install and updates">
      {updateReady ? (
        <div className="pwa-banner" role="status">
          <p>A new version of AthleteOS is ready.</p>
          <div className="pwa-banner-actions">
            <button type="button" className="primary" onClick={onApplyUpdate}>
              Update
            </button>
          </div>
        </div>
      ) : null}

      {showAndroidInstall ? (
        <div className="pwa-banner">
          <p>Install AthleteOS for quicker access from your home screen.</p>
          <div className="pwa-banner-actions">
            <button type="button" className="secondary" onClick={onDismissInstall}>
              Not now
            </button>
            <button type="button" className="primary" onClick={() => void onInstallClick()}>
              Install AthleteOS
            </button>
          </div>
        </div>
      ) : null}

      {showIosEntry ? (
        <div className="pwa-banner">
          <p>Add AthleteOS to your Home Screen for an app-like experience.</p>
          <div className="pwa-banner-actions">
            <button type="button" className="secondary" onClick={onDismissInstall}>
              Not now
            </button>
            <button type="button" className="primary" onClick={() => setIosHelpOpen(true)}>
              Install AthleteOS
            </button>
          </div>
        </div>
      ) : null}

      {showIosHelp ? (
        <div className="pwa-banner" role="dialog" aria-label="Install on iPhone">
          <p>
            Open the Share menu, then choose <strong>Add to Home Screen</strong>.
          </p>
          <div className="pwa-banner-actions">
            <button type="button" className="primary" onClick={onDismissInstall}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
