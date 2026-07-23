import type { Page } from "playwright";

/** Fills and submits LinkedIn's email/password login form. Best-effort — LinkedIn
 * frequently interposes a captcha/verification step here, so this falls through
 * silently if selectors don't match, leaving the headed browser open for manual
 * completion. */
export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  const usernameField = page.locator('input#username, input[name="session_key"]').first();
  await usernameField.waitFor({ state: "visible", timeout: 15000 });
  await usernameField.fill(username);
  await page.locator('input#password, input[name="session_password"]').first().fill(password);
  await page.getByRole("button", { name: /Sign in/i }).first().click();
}
