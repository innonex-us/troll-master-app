import type { Page } from "playwright";
import { linkedinConfig } from "./config.js";

export async function scrapeHashtag(page: Page, hashtag: string, limit: number): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  await page.goto(`${linkedinConfig.baseUrl}/feed/hashtag/?keywords=${encodeURIComponent(tag)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);

  const urls = new Set<string>();
  for (let i = 0; i < 6 && urls.size < limit; i++) {
    const hrefs = await page
      .locator('a[href*="/feed/update/urn:li:activity:"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));
    for (const href of hrefs) {
      if (href) urls.add(href.split("?")[0]);
      if (urls.size >= limit) break;
    }
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(900);
  }
  return Array.from(urls).slice(0, limit);
}

/**
 * LinkedIn doesn't expose a public followers/connections list the way
 * Instagram/Twitter do (a profile's connections are only browsable to the
 * profile owner or mutual 1st-degree connections), so this reads the
 * "People also viewed" sidebar module as the closest available proxy for
 * "accounts related to this seed". Best-effort, frequently returns few or
 * no results.
 */
export async function scrapeFollowersOf(page: Page, username: string, limit: number): Promise<string[]> {
  const handle = username.replace(/^@/, "");
  await page.goto(`${linkedinConfig.baseUrl}/in/${handle}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const handles = new Set<string>();
  for (let i = 0; i < 4 && handles.size < limit; i++) {
    const hrefs = await page
      .locator('a[href*="/in/"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href")));
    for (const href of hrefs) {
      const match = href?.match(/\/in\/([A-Za-z0-9-]+)\/?/);
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
