import type { Page } from "playwright";
import type { Platform } from "./types.js";

export type PlatformIssue = "challenged" | "banned";

export type DetectionResult = {
  issue: PlatformIssue;
  detail: string;
} | null;

async function textVisible(page: Page, pattern: RegExp): Promise<boolean> {
  return page.getByText(pattern).first().isVisible().catch(() => false);
}

async function detectInstagram(page: Page): Promise<DetectionResult> {
  const url = page.url();
  if (url.includes("/accounts/suspended") || url.includes("/accounts/disabled")) {
    return { issue: "banned", detail: "Instagram reports this account suspended/disabled" };
  }
  if (url.includes("/challenge/")) {
    return { issue: "challenged", detail: "Instagram checkpoint/challenge page shown" };
  }
  if (await textVisible(page, /suspended your account|help us confirm it'?s you|enter the confirmation code/i)) {
    return { issue: "challenged", detail: "Instagram challenge prompt detected on page" };
  }
  return null;
}

async function detectTwitter(page: Page): Promise<DetectionResult> {
  const url = page.url();
  if (url.includes("/suspended")) {
    return { issue: "banned", detail: "X/Twitter reports this account suspended" };
  }
  if (url.includes("/account/access") || url.includes("/i/flow/login")) {
    return { issue: "challenged", detail: "X/Twitter is asking to re-authenticate or verify identity" };
  }
  const arkoseVisible = await page
    .locator('iframe[src*="arkoselabs"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (arkoseVisible) {
    return { issue: "challenged", detail: "X/Twitter presented an Arkose captcha challenge" };
  }
  if (await textVisible(page, /account (is|has been) locked|confirm your identity/i)) {
    return { issue: "challenged", detail: "X/Twitter challenge prompt detected on page" };
  }
  return null;
}

async function detectFacebook(page: Page): Promise<DetectionResult> {
  const url = page.url();
  if (url.includes("/checkpoint/") && (await textVisible(page, /disabled|suspended/i))) {
    return { issue: "banned", detail: "Facebook reports this account disabled/suspended" };
  }
  if (url.includes("/checkpoint/")) {
    return { issue: "challenged", detail: "Facebook checkpoint/challenge page shown" };
  }
  if (await textVisible(page, /confirm your identity|we suspended|verify it'?s you/i)) {
    return { issue: "challenged", detail: "Facebook challenge prompt detected on page" };
  }
  return null;
}

async function detectTiktok(page: Page): Promise<DetectionResult> {
  const url = page.url();
  if (url.includes("/legal/account-suspended") || url.includes("/banned")) {
    return { issue: "banned", detail: "TikTok reports this account suspended/banned" };
  }
  if (await textVisible(page, /verify to continue|confirm it'?s you|enter the code we (sent|texted)/i)) {
    return { issue: "challenged", detail: "TikTok challenge/verification prompt detected on page" };
  }
  const captchaVisible = await page
    .locator('div[id*="captcha"], iframe[src*="captcha"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (captchaVisible) {
    return { issue: "challenged", detail: "TikTok presented a captcha challenge" };
  }
  return null;
}

async function detectLinkedin(page: Page): Promise<DetectionResult> {
  const url = page.url();
  if (url.includes("/checkpoint/challengesV2/") || url.includes("/checkpoint/challenge/")) {
    return { issue: "challenged", detail: "LinkedIn checkpoint/challenge page shown" };
  }
  if (await textVisible(page, /restricted|we'?ve restricted your account|verify your identity/i)) {
    return { issue: "challenged", detail: "LinkedIn challenge/restriction prompt detected on page" };
  }
  return null;
}

async function detectYoutube(page: Page): Promise<DetectionResult> {
  const url = page.url();
  if (url.includes("/sorry/") || url.includes("accounts.google.com/signin/rejected")) {
    return { issue: "challenged", detail: "Google flagged unusual traffic / rejected sign-in" };
  }
  if (await textVisible(page, /account has been terminated|channel is not available/i)) {
    return { issue: "banned", detail: "YouTube reports this channel terminated/unavailable" };
  }
  if (await textVisible(page, /verify it'?s you|confirm your identity|2-step verification/i)) {
    return { issue: "challenged", detail: "Google challenge/verification prompt detected on page" };
  }
  return null;
}

const DETECT: Record<Platform, (page: Page) => Promise<DetectionResult>> = {
  instagram: detectInstagram,
  twitter: detectTwitter,
  facebook: detectFacebook,
  tiktok: detectTiktok,
  linkedin: detectLinkedin,
  youtube: detectYoutube,
};

export async function detectIssue(page: Page, platform: Platform): Promise<DetectionResult> {
  return DETECT[platform](page);
}
