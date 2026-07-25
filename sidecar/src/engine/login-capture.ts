import type { BrowserContext, Page } from "playwright";
import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { trySolveCaptcha } from "./captcha.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { tiktokConfig } from "../platforms/tiktok/config.js";
import { linkedinConfig } from "../platforms/linkedin/config.js";
import { youtubeConfig } from "../platforms/youtube/config.js";
import { fillLogin as fillInstagramLogin } from "../platforms/instagram/login.js";
import { fillLogin as fillTwitterLogin } from "../platforms/twitter/login.js";
import { fillLogin as fillFacebookLogin } from "../platforms/facebook/login.js";
import { fillLogin as fillTiktokLogin } from "../platforms/tiktok/login.js";
import { fillLogin as fillLinkedinLogin } from "../platforms/linkedin/login.js";
import { fillLogin as fillYoutubeLogin } from "../platforms/youtube/login.js";
import type { AutoLoginParams, LoginCaptureParams, ActionResult, Platform } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

const PLATFORM_CONFIG: Record<Platform, typeof instagramConfig> = {
  instagram: instagramConfig,
  twitter: twitterConfig,
  facebook: facebookConfig,
  tiktok: tiktokConfig,
  linkedin: linkedinConfig,
  youtube: youtubeConfig,
};

const FILL_LOGIN: Record<Platform, typeof fillInstagramLogin> = {
  instagram: fillInstagramLogin,
  twitter: fillTwitterLogin,
  facebook: fillFacebookLogin,
  tiktok: fillTiktokLogin,
  linkedin: fillLinkedinLogin,
  youtube: fillYoutubeLogin,
};

function platformConfig(platform: Platform) {
  return PLATFORM_CONFIG[platform];
}

function fillLoginFor(platform: Platform) {
  return FILL_LOGIN[platform];
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
  captchaProvider?: string,
  captchaApiKey?: string,
): Promise<ActionResult> {
  const deadline = Date.now() + TIMEOUT_MS;
  let captchaTried = false;
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

    // If a reCAPTCHA is present and a solver is configured, try it once.
    if (!captchaTried && captchaProvider && captchaApiKey) {
      captchaTried = true;
      await trySolveCaptcha(page, captchaProvider, captchaApiKey);
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
      params.captchaProvider,
      params.captchaApiKey,
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
      params.captchaProvider,
      params.captchaApiKey,
    );
  } finally {
    await closeContext(opened);
  }
}
