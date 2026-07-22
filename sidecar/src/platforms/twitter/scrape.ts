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
