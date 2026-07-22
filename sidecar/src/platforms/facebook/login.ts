import type { Page } from "playwright";

/** Fills and submits Facebook's single-screen login form. Best-effort. */
export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  const emailField = page.locator('input[name="email"]').first();
  await emailField.waitFor({ state: "visible", timeout: 15000 });
  await emailField.fill(username);
  await page.locator('input[name="pass"]').first().fill(password);
  await page.locator('button[name="login"]').first().click();
}
