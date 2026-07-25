import type { Page } from "playwright";

// Best-effort reCAPTCHA v2 solving via a third-party service (2captcha or the
// anti-captcha-compatible API). This only handles the common "checkbox"
// reCAPTCHA embedded in an iframe with a data-sitekey — it detects the sitekey
// on the page, submits it to the service, polls for the token, and injects it
// into the g-recaptcha-response field. Platforms increasingly use proprietary /
// enterprise challenges this cannot solve, so callers must treat success as a
// bonus, not a guarantee.

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Returns the reCAPTCHA sitekey present on the page, or null. */
async function findSitekey(page: Page): Promise<string | null> {
  const el = page.locator("[data-sitekey], .g-recaptcha[data-sitekey]").first();
  const key = await el.getAttribute("data-sitekey").catch(() => null);
  if (key) return key;
  // sometimes the key is only in the reCAPTCHA iframe src
  const src = await page
    .locator('iframe[src*="recaptcha"]')
    .first()
    .getAttribute("src")
    .catch(() => null);
  const m = src?.match(/[?&]k=([^&]+)/);
  return m ? m[1] : null;
}

async function solveWith2captcha(apiKey: string, sitekey: string, pageUrl: string): Promise<string | null> {
  const inResp = await fetch(
    `https://2captcha.com/in.php?key=${encodeURIComponent(apiKey)}&method=userrecaptcha&googlekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`,
  ).then((r) => r.json() as Promise<{ status: number; request: string }>);
  if (inResp.status !== 1) return null;
  const id = inResp.request;
  // poll up to ~120s
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const res = await fetch(
      `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=${id}&json=1`,
    ).then((r) => r.json() as Promise<{ status: number; request: string }>);
    if (res.status === 1) return res.request;
    if (res.request !== "CAPCHA_NOT_READY") return null;
  }
  return null;
}

async function solveWithAnticaptcha(apiKey: string, sitekey: string, pageUrl: string): Promise<string | null> {
  const create = await fetch("https://api.anti-captcha.com/createTask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "NoCaptchaTaskProxyless", websiteURL: pageUrl, websiteKey: sitekey },
    }),
  }).then((r) => r.json() as Promise<{ errorId: number; taskId?: number }>);
  if (create.errorId !== 0 || !create.taskId) return null;
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const res = await fetch("https://api.anti-captcha.com/getTaskResult", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId: create.taskId }),
    }).then((r) => r.json() as Promise<{ status?: string; solution?: { gRecaptchaResponse?: string } }>);
    if (res.status === "ready") return res.solution?.gRecaptchaResponse ?? null;
  }
  return null;
}

/** Attempts to detect and solve a reCAPTCHA on the current page using the
 * configured provider. Returns true if a token was injected. No-op (false) if
 * no provider/key, no sitekey, or the solve fails. */
export async function trySolveCaptcha(
  page: Page,
  provider: string | undefined,
  apiKey: string | undefined,
): Promise<boolean> {
  if (!provider || !apiKey) return false;
  try {
    const sitekey = await findSitekey(page);
    if (!sitekey) return false;
    const pageUrl = page.url();
    const token =
      provider === "anticaptcha"
        ? await solveWithAnticaptcha(apiKey, sitekey, pageUrl)
        : await solveWith2captcha(apiKey, sitekey, pageUrl);
    if (!token) return false;
    await page.evaluate((t) => {
      const set = (sel: string) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        if (el) el.value = t;
      };
      set("#g-recaptcha-response");
      set('textarea[name="g-recaptcha-response"]');
    }, token);
    return true;
  } catch {
    return false;
  }
}
