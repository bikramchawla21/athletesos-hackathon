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

export function isIosLikeUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const iOSDevice = /iphone|ipad|ipod/.test(ua);
  // iPadOS 13+ desktop UA still includes Macintosh + touch
  const iPadDesktop = ua.includes("macintosh") && ua.includes("safari") && !ua.includes("chrome");
  return iOSDevice || iPadDesktop;
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
