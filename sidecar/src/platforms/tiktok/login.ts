import type { Page } from "playwright";

/** Fills and submits TikTok's email/password login form. Best-effort — TikTok
 * frequently interposes a captcha here, so this falls through silently if
 * selectors don't match, leaving the headed browser open for manual completion. */
export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  const usernameField = page.locator('input[name="username"]').first();
  await usernameField.waitFor({ state: "visible", timeout: 15000 });
  await usernameField.fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('[data-e2e="login-button"], button[type="submit"]').first().click();
}
