import type { Page } from "playwright";

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

export async function detectIssue(
  page: Page,
  platform: "instagram" | "twitter" | "facebook",
): Promise<DetectionResult> {
  if (platform === "instagram") return detectInstagram(page);
  if (platform === "twitter") return detectTwitter(page);
  return detectFacebook(page);
}
