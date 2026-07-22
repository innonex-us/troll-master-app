import type { Page } from "playwright";

/** X/Twitter's login is a two-step flow: username screen, then password screen
 * (sometimes an extra "verify your identity" username-repeat step, which this
 * doesn't handle — the headed browser stays open for the user to finish manually
 * if that happens). Best-effort. */
export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  const usernameField = page.locator('input[autocomplete="username"]').first();
  await usernameField.waitFor({ state: "visible", timeout: 15000 });
  await usernameField.fill(username);
  await page.getByRole("button", { name: /Next/i }).first().click();

  const passwordField = page.locator('input[name="password"]').first();
  await passwordField.waitFor({ state: "visible", timeout: 10000 });
  await passwordField.fill(password);
  await page.getByRole("button", { name: /Log in/i }).first().click();
}
