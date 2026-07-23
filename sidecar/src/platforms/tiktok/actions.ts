import type { Page } from "playwright";
import { tiktokConfig } from "./config.js";
import type { ActionResult } from "../../engine/types.js";

function profileUrl(handle: string): string {
  return `${tiktokConfig.baseUrl}/@${handle.replace(/^@/, "")}`;
}

export async function follow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const button = page.locator('[data-e2e="follow-button"]').first();
  if (!(await button.isVisible().catch(() => false))) {
    return { status: "error", message: `follow button not found for ${target}` };
  }
  const label = (await button.innerText().catch(() => "")).trim().toLowerCase();
  if (label === "following" || label === "friends") {
    return { status: "skipped", message: `already following ${target}` };
  }
  await button.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `followed ${target}` };
}

export async function unfollow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const button = page.locator('[data-e2e="follow-button"]').first();
  const label = (await button.innerText().catch(() => "")).trim().toLowerCase();
  if (label !== "following" && label !== "friends") {
    return { status: "skipped", message: `not following ${target}` };
  }
  await button.click();
  const confirm = page.getByRole("button", { name: /^Unfollow$/i }).last();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `unfollowed ${target}` };
}

export async function like(page: Page, videoUrl: string): Promise<ActionResult> {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('[data-e2e="like-icon"]').first();
  if (!(await likeButton.isVisible().catch(() => false))) {
    return { status: "error", message: `like button not found for ${videoUrl}` };
  }
  const pressed = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (pressed === "true") {
    return { status: "skipped", message: `already liked ${videoUrl}` };
  }
  await likeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `liked ${videoUrl}` };
}

export async function unlike(page: Page, videoUrl: string): Promise<ActionResult> {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('[data-e2e="like-icon"]').first();
  const pressed = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (pressed !== "true") {
    return { status: "skipped", message: `not liked ${videoUrl}` };
  }
  await likeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `unliked ${videoUrl}` };
}

export async function comment(page: Page, videoUrl: string, text: string): Promise<ActionResult> {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  const box = page.locator('[data-e2e="comment-input"]').first();
  if (!(await box.isVisible().catch(() => false))) {
    return { status: "error", message: `comment box not found for ${videoUrl}` };
  }
  await box.click();
  await box.fill(text);
  await page.locator('[data-e2e="comment-post"]').first().click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `commented on ${videoUrl}` };
}

export async function save(page: Page, videoUrl: string): Promise<ActionResult> {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  const favoriteButton = page.locator('[data-e2e="favorite-icon"]').first();
  if (!(await favoriteButton.isVisible().catch(() => false))) {
    return { status: "error", message: `favorite button not found for ${videoUrl}` };
  }
  const pressed = await favoriteButton.getAttribute("aria-pressed").catch(() => null);
  if (pressed === "true") {
    return { status: "skipped", message: `already saved ${videoUrl}` };
  }
  await favoriteButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `saved ${videoUrl}` };
}

export async function viewStory(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const storyRing = page.locator('[data-e2e="story-avatar"]').first();
  if (!(await storyRing.isVisible().catch(() => false))) {
    return { status: "skipped", message: `${target} has no active story` };
  }
  await storyRing.click();
  await page.waitForTimeout(3000);
  return { status: "success", message: `viewed ${target}'s story` };
}

export async function reactStory(
  page: Page,
  target: string,
  reactionType: string,
  replyText: string,
): Promise<ActionResult> {
  const viewed = await viewStory(page, target);
  if (viewed.status !== "success") return viewed;

  if (reactionType === "comment") {
    const box = page.locator('[data-e2e="story-reply-input"], div[contenteditable="true"]').first();
    if (!(await box.isVisible().catch(() => false))) {
      return { status: "skipped", message: `no reply box available on ${target}'s story` };
    }
    await box.click();
    await box.fill(replyText);
    await box.press("Enter");
    await page.waitForTimeout(1000);
    return { status: "success", message: `replied to ${target}'s story` };
  }

  const reactionButton = page.locator('[data-e2e="story-like-icon"]').first();
  if (!(await reactionButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `no quick-reaction available on ${target}'s story` };
  }
  await reactionButton.click();
  await page.waitForTimeout(800);
  return { status: "success", message: `reacted to ${target}'s story` };
}

export async function dm(page: Page, target: string, message: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const messageButton = page.locator('[data-e2e="message-button"]').first();
  if (!(await messageButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `messaging not available for ${target}` };
  }
  await messageButton.click();

  const box = page.locator('[data-e2e="message-input-area"], div[contenteditable="true"]').first();
  if (!(await box.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `message composer did not open for ${target}` };
  }
  await box.click();
  await box.fill(message);
  await box.press("Enter");
  await page.waitForTimeout(1200);
  return { status: "success", message: `sent message to ${target}` };
}
