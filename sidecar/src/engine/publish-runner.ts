import type { Page } from "playwright";
import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { tiktokConfig } from "../platforms/tiktok/config.js";
import { linkedinConfig } from "../platforms/linkedin/config.js";
import type { Platform, PublishPostParams, PublishPostResult } from "./types.js";

// Content publishing is the most fragile automation in the app — every platform's
// composer is a bespoke, frequently-changing multi-step flow, and some (YouTube)
// are effectively un-automatable from the web without tripping verification. Each
// handler below is best-effort; failures are reported back and surfaced in the UI.

async function setMedia(page: Page, mediaPath: string): Promise<boolean> {
  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) return false;
  await input.setInputFiles(mediaPath).catch(() => {});
  return true;
}

async function publishTwitter(page: Page, mediaPath: string, caption: string): Promise<PublishPostResult> {
  await page.goto(`${twitterConfig.baseUrl}/compose/tweet`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const box = page.locator('[data-testid="tweetTextarea_0"], div[contenteditable="true"]').first();
  if (!(await box.isVisible().catch(() => false))) {
    return { status: "error", message: "tweet composer did not open" };
  }
  if (caption) {
    await box.click();
    await box.fill(caption);
  }
  if (mediaPath) await setMedia(page, mediaPath);
  await page.waitForTimeout(3000); // let media upload
  const post = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
  if (!(await post.isEnabled().catch(() => false))) {
    return { status: "error", message: "post button not ready (media still uploading?)" };
  }
  await post.click();
  await page.waitForTimeout(2000);
  return { status: "success", message: "posted to X/Twitter" };
}

async function publishInstagram(page: Page, mediaPath: string, caption: string): Promise<PublishPostResult> {
  if (!mediaPath) return { status: "error", message: "Instagram requires an image/video" };
  await page.goto(instagramConfig.baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const create = page.locator('svg[aria-label="New post"], svg[aria-label="Create"]').first();
  if (!(await create.isVisible().catch(() => false))) {
    return { status: "error", message: "create button not found" };
  }
  await create.click();
  await page.waitForTimeout(1000);
  if (!(await setMedia(page, mediaPath))) {
    return { status: "error", message: "file input not found in create dialog" };
  }
  await page.waitForTimeout(1500);
  // Two "Next" steps (crop, filter/edit), then caption, then Share.
  for (let i = 0; i < 2; i++) {
    const next = page.getByRole("button", { name: /^Next$/i }).first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(1000);
    }
  }
  if (caption) {
    const cap = page.getByLabel(/Write a caption/i).first();
    if (await cap.isVisible().catch(() => false)) {
      await cap.click();
      await cap.fill(caption);
    }
  }
  const share = page.getByRole("button", { name: /^Share$/i }).first();
  if (!(await share.isVisible().catch(() => false))) {
    return { status: "error", message: "share button not found" };
  }
  await share.click();
  await page.waitForTimeout(4000);
  return { status: "success", message: "posted to Instagram" };
}

async function publishFacebook(page: Page, mediaPath: string, caption: string): Promise<PublishPostResult> {
  await page.goto(facebookConfig.baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const opener = page.getByText(/What'?s on your mind/i).first();
  if (!(await opener.isVisible().catch(() => false))) {
    return { status: "error", message: "post composer opener not found" };
  }
  await opener.click();
  await page.waitForTimeout(1500);
  if (caption) {
    const box = page.locator('div[contenteditable="true"]').first();
    await box.click().catch(() => {});
    await box.fill(caption).catch(() => {});
  }
  if (mediaPath) {
    await setMedia(page, mediaPath);
    await page.waitForTimeout(3000);
  }
  const post = page.getByRole("button", { name: /^Post$/i }).first();
  if (!(await post.isVisible().catch(() => false))) {
    return { status: "error", message: "post button not found" };
  }
  await post.click();
  await page.waitForTimeout(3000);
  return { status: "success", message: "posted to Facebook" };
}

async function publishTiktok(page: Page, mediaPath: string, caption: string): Promise<PublishPostResult> {
  if (!mediaPath) return { status: "error", message: "TikTok requires a video" };
  await page.goto(`${tiktokConfig.baseUrl}/upload?lang=en`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  if (!(await setMedia(page, mediaPath))) {
    return { status: "error", message: "upload input not found" };
  }
  await page.waitForTimeout(6000); // video processing
  if (caption) {
    const cap = page.locator('div[contenteditable="true"]').first();
    await cap.click().catch(() => {});
    await cap.fill(caption).catch(() => {});
  }
  const post = page.getByRole("button", { name: /^Post$/i }).first();
  if (!(await post.isVisible().catch(() => false))) {
    return { status: "error", message: "post button not found (upload still processing?)" };
  }
  await post.click();
  await page.waitForTimeout(3000);
  return { status: "success", message: "posted to TikTok" };
}

async function publishLinkedin(page: Page, mediaPath: string, caption: string): Promise<PublishPostResult> {
  await page.goto(`${linkedinConfig.baseUrl}/feed/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const start = page.getByRole("button", { name: /Start a post/i }).first();
  if (!(await start.isVisible().catch(() => false))) {
    return { status: "error", message: "start-a-post button not found" };
  }
  await start.click();
  await page.waitForTimeout(1500);
  if (caption) {
    const box = page.locator('div.ql-editor, div[contenteditable="true"]').first();
    await box.click().catch(() => {});
    await box.fill(caption).catch(() => {});
  }
  if (mediaPath) {
    await setMedia(page, mediaPath);
    await page.waitForTimeout(3000);
  }
  const post = page.getByRole("button", { name: /^Post$/i }).first();
  if (!(await post.isVisible().catch(() => false))) {
    return { status: "error", message: "post button not found" };
  }
  await post.click();
  await page.waitForTimeout(3000);
  return { status: "success", message: "posted to LinkedIn" };
}

const PUBLISH: Record<Platform, (page: Page, media: string, caption: string) => Promise<PublishPostResult>> = {
  twitter: publishTwitter,
  instagram: publishInstagram,
  facebook: publishFacebook,
  tiktok: publishTiktok,
  linkedin: publishLinkedin,
  youtube: async () => ({ status: "skipped", message: "YouTube publishing isn't supported via web automation" }),
};

export async function runPublishPost(params: PublishPostParams): Promise<PublishPostResult> {
  const opened = await openContext({
    headless: true,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
    storageStatePlainPath: params.storageStatePlainPath,
  });

  try {
    const page = await opened.context.newPage();
    const result = await PUBLISH[params.platform](page, params.mediaPath, params.caption);
    // best-effort challenge detection after the attempt
    const issue = await detectIssue(page, params.platform).catch(() => null);
    if (issue) return { status: "error", message: issue.detail };
    await opened.context.storageState({ path: params.storageStatePlainPath }).catch(() => {});
    return result;
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    await closeContext(opened);
  }
}
