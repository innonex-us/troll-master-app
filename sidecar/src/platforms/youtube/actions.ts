import type { Page } from "playwright";
import { youtubeConfig } from "./config.js";
import type { ActionResult } from "../../engine/types.js";

function channelUrl(handle: string): string {
  return `${youtubeConfig.baseUrl}/@${handle.replace(/^@/, "")}`;
}

export async function follow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(channelUrl(target), { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /^Subscribe$/i }).first();
  if (!(await button.isVisible().catch(() => false))) {
    const already = await page
      .getByRole("button", { name: /^Subscribed$/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (already) {
      return { status: "skipped", message: `already subscribed to ${target}` };
    }
    return { status: "error", message: `subscribe button not found for ${target}` };
  }
  await button.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `subscribed to ${target}` };
}

export async function unfollow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(channelUrl(target), { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: /^Subscribed$/i }).first();
  if (!(await button.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not subscribed to ${target}` };
  }
  await button.click();
  const confirm = page.getByRole("button", { name: /^Unsubscribe$/i }).last();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `unsubscribed from ${target}` };
}

export async function like(page: Page, videoUrl: string): Promise<ActionResult> {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('#segmented-like-button button, like-button-view-model button').first();
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
  const likeButton = page.locator('#segmented-like-button button, like-button-view-model button').first();
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
  const placeholder = page.locator("#simplebox-placeholder").first();
  if (await placeholder.isVisible().catch(() => false)) {
    await placeholder.click();
  }
  const box = page.locator("#contenteditable-root").first();
  if (!(await box.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `comment box not found for ${videoUrl}` };
  }
  await box.click();
  await box.fill(text);
  const submit = page.locator("#submit-button button, ytd-button-renderer#submit-button").first();
  await submit.click().catch(() => {});
  await page.waitForTimeout(1500);
  return { status: "success", message: `commented on ${videoUrl}` };
}

/** YouTube's closest analogue to a "story" is a channel's Community post or a
 * Short — this views the channel's most recent Community-tab post. */
export async function viewStory(page: Page, target: string): Promise<ActionResult> {
  await page.goto(`${channelUrl(target)}/community`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const post = page.locator("ytd-backstage-post-thread-renderer").first();
  if (!(await post.isVisible().catch(() => false))) {
    return { status: "skipped", message: `${target} has no recent community post` };
  }
  await post.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  return { status: "success", message: `viewed ${target}'s community post` };
}

/** Reacts to the channel's most recent Community post (YouTube's closest
 * analogue to a story) with a like or a text reply. */
export async function reactStory(
  page: Page,
  target: string,
  reactionType: string,
  replyText: string,
): Promise<ActionResult> {
  const viewed = await viewStory(page, target);
  if (viewed.status !== "success") return viewed;

  const post = page.locator("ytd-backstage-post-thread-renderer").first();

  if (reactionType === "comment") {
    const placeholder = post.locator("#placeholder-area").first();
    if (await placeholder.isVisible().catch(() => false)) {
      await placeholder.click();
    }
    const box = post.locator('#contenteditable-root, div[contenteditable="true"]').first();
    if (!(await box.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false))) {
      return { status: "skipped", message: `no reply box available on ${target}'s community post` };
    }
    await box.click();
    await box.fill(replyText);
    const submit = post.locator("#submit-button button").first();
    await submit.click().catch(() => {});
    await page.waitForTimeout(1000);
    return { status: "success", message: `replied to ${target}'s community post` };
  }

  const reactionButton = post.locator("#like-button button").first();
  if (!(await reactionButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `no quick-reaction available on ${target}'s community post` };
  }
  await reactionButton.click();
  await page.waitForTimeout(800);
  return { status: "success", message: `reacted to ${target}'s community post` };
}

export async function dm(page: Page, target: string, message: string): Promise<ActionResult> {
  await page.goto(`${channelUrl(target)}/about`, { waitUntil: "domcontentloaded" });
  const messageButton = page.getByRole("button", { name: /^Message$/i }).first();
  if (!(await messageButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `messaging not available for ${target}` };
  }
  await messageButton.click();

  const box = page.locator('div[contenteditable="true"]').first();
  if (!(await box.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `message composer did not open for ${target}` };
  }
  await box.click();
  await box.fill(message);
  await box.press("Enter");
  await page.waitForTimeout(1200);
  return { status: "success", message: `sent message to ${target}` };
}

/** Opens a video and dwells for a realistic watch time. */
export async function watchVideo(page: Page, videoUrl: string): Promise<ActionResult> {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000 + Math.floor(Math.random() * 20000));
  return { status: "success", message: `watched ${videoUrl}` };
}
