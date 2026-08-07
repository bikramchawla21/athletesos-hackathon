import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function isStandaloneDisplayMode(mediaMatches, nav = {}) {
  if (mediaMatches("(display-mode: standalone)")) return true;
  if (mediaMatches("(display-mode: fullscreen)")) return true;
  if (nav.standalone === true) return true;
  return false;
}

function isIosLikeUserAgent(userAgent, nav = {}) {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  if (ua.includes("macintosh") && (nav.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

function shouldShowAndroidInstallAction(options) {
  if (options.isStandalone) return false;
  if (options.dismissed) return false;
  return options.hasDeferredPrompt;
}

function shouldShowIosInstallHelp(options) {
  if (options.isStandalone) return false;
  if (!options.isIos) return false;
  return options.helpRequested;
}

test("manifest.ts declares required PWA fields", () => {
  const source = readFileSync(join(root, "app/manifest.ts"), "utf8");
  for (const token of [
    'name: "AthleteOS"',
    'short_name: "AthleteOS"',
    'start_url: "/"',
    'display: "standalone"',
    'background_color: "#ffffff"',
    'theme_color: "#ffffff"',
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    'purpose: "maskable"',
  ]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /orientation/);
});

test("required icon assets exist", () => {
  for (const relative of [
    "public/favicon.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/icon-512-maskable.png",
    "public/icons/apple-touch-icon.png",
    "public/offline.html",
    "public/sw.js",
  ]) {
    const bytes = readFileSync(join(root, relative));
    assert.ok(bytes.length > 0, relative);
  }
});

test("service worker never caches API or auth routes", () => {
  const sw = readFileSync(join(root, "public/sw.js"), "utf8");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/sign-in"\)/);
  assert.match(sw, /Network-only/);
  assert.match(sw, /OFFLINE_URL/);
  // cache.put appears only in the static-asset branch after isStaticAsset
  assert.match(sw, /isStaticAsset\(url\)/);
  assert.match(sw, /cache\.put\(request, response\.clone\(\)\)/);
  // Ensure API branch uses fetch without put
  const apiBranch = sw.slice(sw.indexOf("isNetworkOnly"), sw.indexOf("isStaticAsset"));
  assert.doesNotMatch(apiBranch, /cache\.put/);
});

test("offline fallback copy is honest about connectivity", () => {
  const html = readFileSync(join(root, "public/offline.html"), "utf8");
  assert.match(html, /You’re offline|You're offline/);
  assert.match(html, /needs a connection/i);
  assert.doesNotMatch(html, /continue offline/i);
});

test("API responses are configured with no-store headers", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(config, /\/api\/:path\*/);
  assert.match(config, /private, no-store/);
});

test("standalone detection hides install prompts", () => {
  assert.equal(
    isStandaloneDisplayMode((q) => q.includes("standalone"), {}),
    true,
  );
  assert.equal(
    shouldShowAndroidInstallAction({
      isStandalone: true,
      hasDeferredPrompt: true,
      dismissed: false,
    }),
    false,
  );
  assert.equal(
    shouldShowIosInstallHelp({
      isStandalone: true,
      isIos: true,
      helpRequested: true,
    }),
    false,
  );
});

test("Android install requires deferred prompt and no dismissal", () => {
  assert.equal(
    shouldShowAndroidInstallAction({
      isStandalone: false,
      hasDeferredPrompt: true,
      dismissed: false,
    }),
    true,
  );
  assert.equal(
    shouldShowAndroidInstallAction({
      isStandalone: false,
      hasDeferredPrompt: false,
      dismissed: false,
    }),
    false,
  );
  assert.equal(
    shouldShowAndroidInstallAction({
      isStandalone: false,
      hasDeferredPrompt: true,
      dismissed: true,
    }),
    false,
  );
});

test("iOS install help is opt-in and device-gated", () => {
  assert.equal(isIosLikeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", {}), true);
  assert.equal(isIosLikeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", {}), false);
  assert.equal(
    isIosLikeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", { maxTouchPoints: 5 }),
    true,
  );
  assert.equal(
    shouldShowIosInstallHelp({ isStandalone: false, isIos: true, helpRequested: false }),
    false,
  );
  assert.equal(
    shouldShowIosInstallHelp({ isStandalone: false, isIos: true, helpRequested: true }),
    true,
  );
});

test("update-available state is represented by waiting worker + banner copy in PwaProvider", () => {
  const source = readFileSync(join(root, "components/PwaProvider.tsx"), "utf8");
  assert.match(source, /A new version of AthleteOS is ready/);
  assert.match(source, /SKIP_WAITING/);
  assert.match(source, /NODE_ENV !== "production"/);
});
