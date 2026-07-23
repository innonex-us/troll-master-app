import type { Page } from "playwright";

/**
 * Fills Google's two-step account login (email screen, then password screen).
 * Google very frequently interposes 2FA/device-verification/captcha here —
 * far more often than the other platforms — so this is explicitly best-effort
 * and falls through silently to let the user finish manually in the still-open
 * headed browser.
 */
export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  const emailField = page.locator('input[type="email"]').first();
  await emailField.waitFor({ state: "visible", timeout: 15000 });
  await emailField.fill(username);
  await page.getByRole("button", { name: /Next/i }).first().click();

  const passwordField = page.locator('input[type="password"]').first();
  await passwordField.waitFor({ state: "visible", timeout: 15000 });
  await passwordField.fill(password);
  await page.getByRole("button", { name: /Next/i }).first().click();
}
