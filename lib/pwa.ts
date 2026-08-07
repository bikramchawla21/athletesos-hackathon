export const PWA_INSTALL_DISMISSED_KEY = "athleteos:pwa-install-dismissed";

export type BeforeInstallPromptLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isStandaloneDisplayMode(
  mediaMatches: (query: string) => boolean,
  nav: { standalone?: boolean } = {},
): boolean {
  if (mediaMatches("(display-mode: standalone)")) return true;
  if (mediaMatches("(display-mode: fullscreen)")) return true;
  if (nav.standalone === true) return true;
  return false;
}

export function isIosLikeUserAgent(
  userAgent: string,
  nav: { maxTouchPoints?: number } = {},
): boolean {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  // iPadOS 13+ may report as Macintosh; require touch points.
  if (ua.includes("macintosh") && (nav.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

export function shouldShowAndroidInstallAction(options: {
  isStandalone: boolean;
  hasDeferredPrompt: boolean;
  dismissed: boolean;
}): boolean {
  if (options.isStandalone) return false;
  if (options.dismissed) return false;
  return options.hasDeferredPrompt;
}

export function shouldShowIosInstallHelp(options: {
  isStandalone: boolean;
  isIos: boolean;
  helpRequested: boolean;
}): boolean {
  if (options.isStandalone) return false;
  if (!options.isIos) return false;
  return options.helpRequested;
}

export function readInstallDismissed(storage: Pick<Storage, "getItem"> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PWA_INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeInstallDismissed(storage: Pick<Storage, "setItem"> | null): void {
  if (!storage) return;
  try {
    storage.setItem(PWA_INSTALL_DISMISSED_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}
