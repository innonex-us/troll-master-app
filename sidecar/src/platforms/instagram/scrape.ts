import type { Page } from "playwright";
import { instagramConfig } from "./config.js";

export async function scrapeHashtag(page: Page, hashtag: string, limit: number): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  await page.goto(`${instagramConfig.baseUrl}/explore/tags/${tag}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const urls = new Set<string>();
  for (let i = 0; i < 6 && urls.size < limit; i++) {
    const hrefs = await page.locator('a[href^="/p/"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    for (const href of hrefs) {
      if (href) urls.add(`${instagramConfig.baseUrl}${href}`);
      if (urls.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(800);
  }
  return Array.from(urls).slice(0, limit);
}

// Instagram's default-avatar image is served from a stable CDN filename across every
// account that never set a profile picture. Heuristic, not a documented API contract —
// if Instagram changes this asset, the skip-no-avatar filter silently stops matching
// (targets just won't get filtered, nothing breaks).
const DEFAULT_AVATAR_HASH = "44884218_345707102882519_2446069589734326272_n";

export async function scrapeFollowersOf(
  page: Page,
  username: string,
  limit: number,
  skipNoAvatar = false,
): Promise<string[]> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${instagramConfig.baseUrl}/${handle}/`, { waitUntil: "domcontentloaded" });

  const followersLink = page.locator('a[href$="/followers/"]').first();
  if (!(await followersLink.isVisible().catch(() => false))) {
    return [];
  }
  await followersLink.click();

  const dialog = page.locator('div[role="dialog"]').first();
  await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

  const usernames = new Set<string>();
  for (let i = 0; i < 10 && usernames.size < limit; i++) {
    const rows = await dialog.locator("li").evaluateAll((els) =>
      els.map((el) => ({
        href: el.querySelector("a[role='link']")?.getAttribute("href") ?? null,
        avatarSrc: el.querySelector("img")?.getAttribute("src") ?? null,
      })),
    );
    for (const row of rows) {
      const match = row.href?.match(/^\/([A-Za-z0-9_.]+)\/?$/);
      if (!match || match[1] === handle) continue;
      if (skipNoAvatar && row.avatarSrc?.includes(DEFAULT_AVATAR_HASH)) continue;
      usernames.add(match[1]);
      if (usernames.size >= limit) break;
    }
    await dialog.locator("a[role='link']").last().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(700);
  }
  return Array.from(usernames).slice(0, limit);
}

/** Reads a profile's grid and returns the newest post/reel URL, if any —
 * used by Engagement Pods to detect a member's newest own post. */
export async function scrapeLatestOwnPost(page: Page, username: string): Promise<string | null> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${instagramConfig.baseUrl}/${handle}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const href = await page.locator('a[href^="/p/"], a[href^="/reel/"]').first().getAttribute("href").catch(() => null);
  return href ? `${instagramConfig.baseUrl}${href}` : null;
}

import { parseCount } from "../../engine/parse-count.js";
import type { OwnStats } from "../../engine/types.js";

/** Reads follower/following/post counts for the logged-in account from its own
 * profile page. Instagram populates og:description like
 * "1,234 Followers, 567 Following, 89 Posts - ...". Best-effort. */
export async function scrapeOwnStats(page: Page, username: string): Promise<OwnStats> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${instagramConfig.baseUrl}/${handle}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const content = await page
    .locator('meta[property="og:description"]')
    .getAttribute("content")
    .catch(() => null);
  if (!content) return { followers: null, following: null, posts: null };
  const followers = parseCount(content.match(/([\d,.]+[KMB]?)\s+Followers/i)?.[1]);
  const following = parseCount(content.match(/([\d,.]+[KMB]?)\s+Following/i)?.[1]);
  const posts = parseCount(content.match(/([\d,.]+[KMB]?)\s+Posts/i)?.[1]);
  return { followers, following, posts };
}
