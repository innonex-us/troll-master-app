import type { Page } from "playwright";
import { instagramConfig } from "./config.js";
import type { ActionResult } from "../../engine/types.js";

function profileUrl(username: string): string {
  return `${instagramConfig.baseUrl}/${username.replace(/^@/, "")}/`;
}

export async function follow(page: Page, username: string): Promise<ActionResult> {
  await page.goto(profileUrl(username), { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /^Follow$/ }).first();
  if (!(await button.isVisible().catch(() => false))) {
    const alreadyFollowing = await page
      .getByRole("button", { name: /Following|Requested/ })
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyFollowing) {
      return { status: "skipped", message: `already following ${username}` };
    }
    return { status: "error", message: `follow button not found for ${username}` };
  }
  await button.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `followed ${username}` };
}

export async function unfollow(page: Page, username: string): Promise<ActionResult> {
  await page.goto(profileUrl(username), { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /Following|Requested/ }).first();
  if (!(await button.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not following ${username}` };
  }
  await button.click();
  const confirm = page.getByRole("button", { name: /^Unfollow$/ }).last();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `unfollowed ${username}` };
}

export async function like(page: Page, postUrl: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('svg[aria-label="Like"]').first();
  if (!(await likeButton.isVisible().catch(() => false))) {
    const alreadyLiked = await page
      .locator('svg[aria-label="Unlike"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyLiked) {
      return { status: "skipped", message: `already liked ${postUrl}` };
    }
    return { status: "error", message: `like button not found for ${postUrl}` };
  }
  await likeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `liked ${postUrl}` };
}

export async function comment(page: Page, postUrl: string, text: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const box = page.getByPlaceholder("Add a comment…").first();
  if (!(await box.isVisible().catch(() => false))) {
    return { status: "error", message: `comment box not found for ${postUrl}` };
  }
  await box.click();
  await box.fill(text);
  const postButton = page.getByRole("button", { name: /^Post$/ }).first();
  await postButton.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `commented on ${postUrl}` };
}
