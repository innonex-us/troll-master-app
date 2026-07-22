import type { BrowserContext, Page } from "playwright";
import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { fillLogin as fillInstagramLogin } from "../platforms/instagram/login.js";
import { fillLogin as fillTwitterLogin } from "../platforms/twitter/login.js";
import { fillLogin as fillFacebookLogin } from "../platforms/facebook/login.js";
import type { AutoLoginParams, LoginCaptureParams, ActionResult } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

function platformConfig(platform: LoginCaptureParams["platform"]) {
  if (platform === "instagram") return instagramConfig;
  if (platform === "twitter") return twitterConfig;
  return facebookConfig;
}

function fillLoginFor(platform: AutoLoginParams["platform"]) {
  if (platform === "instagram") return fillInstagramLogin;
  if (platform === "twitter") return fillTwitterLogin;
  return fillFacebookLogin;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls cookies until the platform's session cookie appears (login succeeded),
 * a ban is detected, or the timeout elapses. Shared by manual capture and auto-login. */
async function pollForSession(
  context: BrowserContext,
  page: Page,
  platform: LoginCaptureParams["platform"],
  sessionCookieName: string,
  storageStatePlainPath: string,
): Promise<ActionResult> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    const loggedIn = cookies.some((c) => c.name === sessionCookieName);
    if (loggedIn) {
      await context.storageState({ path: storageStatePlainPath });
      return { status: "success", message: "login captured" };
    }

    const issue = await detectIssue(page, platform);
    if (issue?.issue === "banned") {
      return { status: "banned", message: issue.detail };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return { status: "error", message: "login timed out waiting for sign-in to complete" };
}

export async function runLoginCapture(params: LoginCaptureParams): Promise<ActionResult> {
  const config = platformConfig(params.platform);
  const opened = await openContext({
    headless: false,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
  });

  try {
    const page = await opened.context.newPage();
    await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
    return await pollForSession(
      opened.context,
      page,
      params.platform,
      config.sessionCookieName,
      params.storageStatePlainPath,
    );
  } finally {
    await closeContext(opened);
  }
}

/**
 * Fills the login form with the stored username/password and submits it — no typing
 * required from the user. Still runs headed: if the platform demands 2FA, a captcha,
 * or an extra verification step our selectors don't handle, the browser stays open
 * for the user to finish manually, same as capture.
 */
export async function runAutoLogin(params: AutoLoginParams): Promise<ActionResult> {
  const config = platformConfig(params.platform);
  const opened = await openContext({
    headless: false,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
  });

  try {
    const page = await opened.context.newPage();
    await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });

    try {
      await fillLoginFor(params.platform)(page, params.username, params.password);
    } catch (err) {
      // selectors didn't match (platform changed its login page, or an
      // interstitial appeared) — fall through to polling so the user can
      // still finish signing in by hand in the still-open browser window.
    }

    return await pollForSession(
      opened.context,
      page,
      params.platform,
      config.sessionCookieName,
      params.storageStatePlainPath,
    );
  } finally {
    await closeContext(opened);
  }
}
