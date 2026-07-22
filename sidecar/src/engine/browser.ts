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

export async function openContext(opts: {
  headless: boolean;
  proxy?: ProxyConfig | null;
  fingerprint: FingerprintConfig;
  storageStatePlainPath?: string;
}): Promise<OpenedContext> {
  const browser = await chromium.launch({
    headless: opts.headless,
    proxy: toPlaywrightProxy(opts.proxy),
  });

  const hasStorageState = opts.storageStatePlainPath && existsSync(opts.storageStatePlainPath);

  const context = await browser.newContext({
    userAgent: opts.fingerprint.userAgent,
    locale: opts.fingerprint.locale,
    timezoneId: opts.fingerprint.timezone,
    viewport: { width: opts.fingerprint.viewportWidth, height: opts.fingerprint.viewportHeight },
    storageState: hasStorageState ? opts.storageStatePlainPath : undefined,
  });

  return { browser, context };
}

export async function closeContext(opened: OpenedContext): Promise<void> {
  await opened.context.close().catch(() => {});
  await opened.browser.close().catch(() => {});
}
