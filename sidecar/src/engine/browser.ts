import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync } from "node:fs";
import type { FingerprintConfig, ProxyConfig } from "./types.js";

function toPlaywrightProxy(proxy?: ProxyConfig | null) {
  if (!proxy) return undefined;
  return {
    server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
    username: proxy.username ?? undefined,
    password: proxy.password ?? undefined,
  };
}

export type OpenedContext = {
  browser: Browser;
  context: BrowserContext;
};

// Injected before any page script runs, on every document (including iframes).
// Patches the signals a stock Playwright/Chromium session leaks that a real
// browser wouldn't: the automation flag, an empty plugins list, a mismatched
// permissions/notification state, and identical canvas/WebGL output across
// every profile. Values come from the profile's stored fingerprint, so a given
// profile reports the same "hardware" every session instead of a fresh one.
function stealthInitScript(fp: FingerprintConfig): string {
  const data = JSON.stringify({
    platform: fp.platform,
    languages: fp.languages,
    hardwareConcurrency: fp.hardwareConcurrency,
    deviceMemory: fp.deviceMemory,
    webglVendor: fp.webglVendor,
    webglRenderer: fp.webglRenderer,
    canvasSeed: fp.canvasSeed,
  });

  return `(() => {
    const fp = ${data};

    const define = (obj, prop, value) => {
      try {
        Object.defineProperty(obj, prop, { get: () => value, configurable: true });
      } catch {}
    };

    define(Navigator.prototype, "webdriver", undefined);
    define(Navigator.prototype, "platform", fp.platform);
    define(Navigator.prototype, "languages", Object.freeze(fp.languages.slice()));
    define(Navigator.prototype, "hardwareConcurrency", fp.hardwareConcurrency);
    define(Navigator.prototype, "deviceMemory", fp.deviceMemory);

    // A real Chrome install always reports the built-in PDF plugins; a vanilla
    // Playwright context reports none, which by itself is a common bot check.
    const fakePlugin = (name, description) => ({ name, filename: "internal-pdf-viewer", description, length: 1 });
    const plugins = [
      fakePlugin("PDF Viewer", "Portable Document Format"),
      fakePlugin("Chrome PDF Viewer", "Portable Document Format"),
      fakePlugin("Chromium PDF Viewer", "Portable Document Format"),
    ];
    define(Navigator.prototype, "plugins", plugins);
    define(
      Navigator.prototype,
      "mimeTypes",
      plugins.map((p) => ({ type: "application/pdf", suffixes: "pdf", description: p.description, enabledPlugin: p }))
    );

    if (!window.chrome) {
      window.chrome = { runtime: {} };
    }

    const originalQuery = window.navigator.permissions && window.navigator.permissions.query
      ? window.navigator.permissions.query.bind(window.navigator.permissions)
      : null;
    if (originalQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === "notifications"
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : originalQuery(params);
    }

    // Deterministic per-profile PRNG: canvas noise is stable across calls and
    // sessions for the same profile, but differs between profiles.
    let seed = 0;
    for (let i = 0; i < fp.canvasSeed.length; i++) seed = (seed * 31 + fp.canvasSeed.charCodeAt(i)) >>> 0;
    function nextNoise() {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed % 7) - 3;
    }

    // Nudge a sparse set of pixels before readback so the resulting hash differs
    // per profile/install without visibly altering the rendered image.
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      try {
        const ctx = this.getContext && this.getContext("2d");
        if (ctx && this.width && this.height) {
          const imgData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imgData.data.length; i += 4 * 97) {
            imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + nextNoise()));
          }
          ctx.putImageData(imgData, 0, 0);
        }
      } catch {}
      return originalToDataURL.apply(this, args);
    };

    // GPU vendor/renderer is the strongest single fingerprint signal; Chromium's
    // default SwiftShader/ANGLE debug string is an instant automation tell.
    const patchGl = (proto) => {
      const original = proto.getParameter;
      proto.getParameter = function (param) {
        if (param === 37445) return fp.webglVendor;
        if (param === 37446) return fp.webglRenderer;
        return original.call(this, param);
      };
    };
    if (window.WebGLRenderingContext) patchGl(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) patchGl(WebGL2RenderingContext.prototype);
  })();`;
}

export async function openContext(opts: {
  headless: boolean;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath?: string;
}): Promise<OpenedContext> {
  const browser = await chromium.launch({
    headless: opts.headless,
    proxy: toPlaywrightProxy(opts.proxy),
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const hasStorageState = opts.storageStatePlainPath && existsSync(opts.storageStatePlainPath);

  const context = await browser.newContext({
    userAgent: opts.fingerprint.userAgent,
    locale: opts.fingerprint.locale,
    timezoneId: opts.fingerprint.timezone,
    viewport: { width: opts.fingerprint.viewportWidth, height: opts.fingerprint.viewportHeight },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    extraHTTPHeaders: { "Accept-Language": opts.fingerprint.languages.join(",") },
    storageState: hasStorageState ? opts.storageStatePlainPath : undefined,
  });

  await context.addInitScript(stealthInitScript(opts.fingerprint));

  return { browser, context };
}

export async function closeContext(opened: OpenedContext): Promise<void> {
  await opened.context.close().catch(() => {});
  await opened.browser.close().catch(() => {});
}
