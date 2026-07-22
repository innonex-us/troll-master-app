import type { Page } from "playwright";
import { facebookConfig } from "./config.js";
import type { ActionResult } from "../../engine/types.js";

function profileUrl(handle: string): string {
  return `${facebookConfig.baseUrl}/${handle.replace(/^@/, "")}`;
}

export async function follow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /^Follow$/ }).first();
  if (!(await button.isVisible().catch(() => false))) {
    const alreadyFollowing = await page
      .getByRole("button", { name: /^Following$/ })
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyFollowing) {
      return { status: "skipped", message: `already following ${target}` };
    }
    return { status: "error", message: `follow button not found for ${target}` };
  }
  await button.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `followed ${target}` };
}

export async function unfollow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /^Following$/ }).first();
  if (!(await button.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not following ${target}` };
  }
  await button.click();
  const confirm = page.getByRole("menuitem", { name: /Unfollow/i }).first();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `unfollowed ${target}` };
}

export async function like(page: Page, postUrl: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('div[aria-label="Like"][role="button"]').first();
  if (!(await likeButton.isVisible().catch(() => false))) {
    const alreadyLiked = await page
      .locator('div[aria-label="Remove Like"][role="button"]')
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

export async function unlike(page: Page, postUrl: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const unlikeButton = page.locator('div[aria-label="Remove Like"][role="button"]').first();
  if (!(await unlikeButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not liked ${postUrl}` };
  }
  await unlikeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `unliked ${postUrl}` };
}

export async function comment(page: Page, postUrl: string, text: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const box = page.getByPlaceholder(/Write a comment/i).first();
  if (!(await box.isVisible().catch(() => false))) {
    return { status: "error", message: `comment box not found for ${postUrl}` };
  }
  await box.click();
  await box.fill(text);
  await box.press("Enter");
  await page.waitForTimeout(1500);
  return { status: "success", message: `commented on ${postUrl}` };
}

export async function dm(page: Page, target: string, message: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const messageButton = page.getByRole("button", { name: /^Message$/ }).first();
  if (!(await messageButton.isVisible().catch(() => false))) {
    return { status: "error", message: `message button not found for ${target}` };
  }
  await messageButton.click();

  const box = page.getByPlaceholder(/Aa|Message/i).first();
  if (!(await box.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `message composer did not open for ${target}` };
  }
  await box.click();
  await box.fill(message);
  await box.press("Enter");
  await page.waitForTimeout(1200);
  return { status: "success", message: `sent message to ${target}` };
}
