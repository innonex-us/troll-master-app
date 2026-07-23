import type { Page } from "playwright";
import { tiktokConfig } from "./config.js";

export async function scrapeHashtag(page: Page, hashtag: string, limit: number): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  await page.goto(`${tiktokConfig.baseUrl}/tag/${encodeURIComponent(tag)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const urls = new Set<string>();
  for (let i = 0; i < 6 && urls.size < limit; i++) {
    const hrefs = await page.locator('a[href*="/video/"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).href),
    );
    for (const href of hrefs) {
      if (href) urls.add(href);
      if (urls.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(800);
  }
  return Array.from(urls).slice(0, limit);
}

/**
 * TikTok doesn't expose a public "followers" list in the web UI (unlike a
 * "following" count, the follower list itself is not browsable for most
 * accounts), so this reads the profile's "Following" tab instead as the best
 * available proxy for "accounts related to this seed". Best-effort only.
 */
export async function scrapeFollowersOf(page: Page, username: string, limit: number): Promise<string[]> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${tiktokConfig.baseUrl}/@${handle}`, { waitUntil: "domcontentloaded" });

  const followingTab = page.locator('[data-e2e="following-count"], a[href$="/following"]').first();
  if (!(await followingTab.isVisible().catch(() => false))) {
    return [];
  }
  await followingTab.click();

  const dialog = page.locator('[data-e2e="follow-info-popup"], div[role="dialog"]').first();
  await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

  const handles = new Set<string>();
  for (let i = 0; i < 10 && handles.size < limit; i++) {
    const hrefs = await dialog
      .locator('a[href^="/@"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href")));
    for (const href of hrefs) {
      const match = href?.match(/^\/@([A-Za-z0-9._]+)\/?$/);
      if (match && match[1].toLowerCase() !== handle.toLowerCase()) {
        handles.add(match[1]);
      }
      if (handles.size >= limit) break;
    }
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(700);
  }
  return Array.from(handles).slice(0, limit);
}

/** Reads a profile's video grid and returns the newest video URL, if any —
 * used by Engagement Pods to detect a member's newest own post. */
export async function scrapeLatestOwnPost(page: Page, username: string): Promise<string | null> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${tiktokConfig.baseUrl}/@${handle}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const href = await page
    .locator('a[href*="/video/"]')
    .first()
    .evaluate((el) => (el as HTMLAnchorElement).href)
    .catch(() => null);
  return href ?? null;
}
