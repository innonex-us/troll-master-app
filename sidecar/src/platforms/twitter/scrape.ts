import type { Page } from "playwright";
import { twitterConfig } from "./config.js";

export async function scrapeHashtag(page: Page, hashtag: string, limit: number): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  await page.goto(`${twitterConfig.baseUrl}/search?q=%23${encodeURIComponent(tag)}&f=live`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  const urls = new Set<string>();
  for (let i = 0; i < 6 && urls.size < limit; i++) {
    const hrefs = await page.locator('a[href*="/status/"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    for (const href of hrefs) {
      if (href) urls.add(`${twitterConfig.baseUrl}${href}`);
      if (urls.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(800);
  }
  return Array.from(urls).slice(0, limit);
}

export async function scrapeFollowersOf(
  page: Page,
  username: string,
  limit: number,
  skipNoAvatar = false,
): Promise<string[]> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${twitterConfig.baseUrl}/${handle}/followers`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const usernames = new Set<string>();
  for (let i = 0; i < 10 && usernames.size < limit; i++) {
    const cells = await page.locator('[data-testid="UserCell"]').evaluateAll((els) =>
      els.map((el) => ({
        href: el.querySelector('a[role="link"]')?.getAttribute("href") ?? null,
        avatarSrc: el.querySelector('img[src*="profile_images"]')?.getAttribute("src") ?? null,
      })),
    );
    for (const cell of cells) {
      const match = cell.href?.match(/^\/([A-Za-z0-9_]+)$/);
      if (!match || match[1].toLowerCase() === handle.toLowerCase()) continue;
      if (skipNoAvatar && (!cell.avatarSrc || cell.avatarSrc.includes("default_profile"))) continue;
      usernames.add(match[1]);
      if (usernames.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(800);
  }
  return Array.from(usernames).slice(0, limit);
}

/** Reads a profile timeline and returns the newest tweet URL, if any — used
 * by Engagement Pods to detect a member's newest own post. */
export async function scrapeLatestOwnPost(page: Page, username: string): Promise<string | null> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${twitterConfig.baseUrl}/${handle}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const href = await page
    .locator('article[data-testid="tweet"] a[href*="/status/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  return href ? `${twitterConfig.baseUrl}${href}` : null;
}

import { parseCount as parseCountTw } from "../../engine/parse-count.js";
import type { OwnStats as OwnStatsTw } from "../../engine/types.js";

/** Best-effort follower/following counts from the profile header links. */
export async function scrapeOwnStats(page: Page, username: string): Promise<OwnStatsTw> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${twitterConfig.baseUrl}/${handle}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const followersText = await page
    .locator(`a[href$="/verified_followers"], a[href$="/followers"]`)
    .first()
    .innerText()
    .catch(() => null);
  const followingText = await page
    .locator(`a[href$="/following"]`)
    .first()
    .innerText()
    .catch(() => null);
  return {
    followers: parseCountTw(followersText?.match(/([\d,.]+[KMB]?)/)?.[1]),
    following: parseCountTw(followingText?.match(/([\d,.]+[KMB]?)/)?.[1]),
    posts: null,
  };
}
