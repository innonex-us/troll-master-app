import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import type { LoginCaptureParams, ActionResult } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

function platformConfig(platform: LoginCaptureParams["platform"]) {
  if (platform === "instagram") return instagramConfig;
  if (platform === "twitter") return twitterConfig;
  return facebookConfig;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const cookies = await opened.context.cookies();
      const loggedIn = cookies.some((c) => c.name === config.sessionCookieName);
      if (loggedIn) {
        await opened.context.storageState({ path: params.storageStatePlainPath });
        return { status: "success", message: "login captured" };
      }

      const issue = await detectIssue(page, params.platform);
      if (issue?.issue === "banned") {
        return { status: "banned", message: issue.detail };
      }

      await sleep(POLL_INTERVAL_MS);
    }

    return { status: "error", message: "login capture timed out waiting for user to sign in" };
  } finally {
    await closeContext(opened);
  }
}
