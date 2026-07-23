import type { Page } from "playwright";
import { linkedinConfig } from "./config.js";
import type { ActionResult } from "../../engine/types.js";

function profileUrl(handle: string): string {
  return `${linkedinConfig.baseUrl}/in/${handle.replace(/^@/, "")}/`;
}

/**
 * LinkedIn shows "Connect" on most profiles but "Follow" on ones where the
 * owner disabled connection requests (influencer/creator accounts) — both
 * are treated as the app's generic "follow" action. A pending request or an
 * existing 1st-degree connection both count as "already following".
 */
export async function follow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });

  const connectButton = page.getByRole("button", { name: /^Connect$/i }).first();
  if (await connectButton.isVisible().catch(() => false)) {
    await connectButton.click();
    const sendWithoutNote = page.getByRole("button", { name: /Send without a note/i }).first();
    if (await sendWithoutNote.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false)) {
      await sendWithoutNote.click();
    }
    await page.waitForTimeout(1200);
    return { status: "success", message: `sent connection request to ${target}` };
  }

  const followButton = page.getByRole("button", { name: /^Follow$/i }).first();
  if (await followButton.isVisible().catch(() => false)) {
    await followButton.click();
    await page.waitForTimeout(1200);
    return { status: "success", message: `followed ${target}` };
  }

  const alreadyLinked = await page
    .getByRole("button", { name: /Pending|Following|Message/i })
    .first()
    .isVisible()
    .catch(() => false);
  if (alreadyLinked) {
    return { status: "skipped", message: `already connected/following ${target}` };
  }
  return { status: "error", message: `connect/follow button not found for ${target}` };
}

export async function unfollow(page: Page, target: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });

  const followingButton = page.getByRole("button", { name: /^Following$/i }).first();
  if (await followingButton.isVisible().catch(() => false)) {
    await followingButton.click();
    await page.waitForTimeout(1000);
    return { status: "success", message: `unfollowed ${target}` };
  }

  const pendingButton = page.getByRole("button", { name: /^Pending$/i }).first();
  if (await pendingButton.isVisible().catch(() => false)) {
    await pendingButton.click();
    const withdraw = page.getByRole("menuitem", { name: /Withdraw/i }).first();
    await withdraw.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
    await withdraw.click().catch(() => {});
    await page.waitForTimeout(1000);
    return { status: "success", message: `withdrew connection request to ${target}` };
  }

  const moreButton = page.getByRole("button", { name: /^More$/i }).first();
  if (await moreButton.isVisible().catch(() => false)) {
    await moreButton.click();
    const removeItem = page.getByRole("menuitem", { name: /Remove Connection/i }).first();
    if (await removeItem.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false)) {
      await removeItem.click();
      const confirm = page.getByRole("button", { name: /^Remove$/i }).first();
      await confirm.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
      await confirm.click().catch(() => {});
      await page.waitForTimeout(1000);
      return { status: "success", message: `removed connection with ${target}` };
    }
  }

  return { status: "skipped", message: `not connected to/following ${target}` };
}

export async function like(page: Page, postUrl: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('button[aria-label^="Like"], button[aria-label^="React Like"]').first();
  if (!(await likeButton.isVisible().catch(() => false))) {
    return { status: "error", message: `like button not found for ${postUrl}` };
  }
  const pressed = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (pressed === "true") {
    return { status: "skipped", message: `already liked ${postUrl}` };
  }
  await likeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `liked ${postUrl}` };
}

export async function unlike(page: Page, postUrl: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('button[aria-label^="Like"], button[aria-label^="React Like"]').first();
  const pressed = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (pressed !== "true") {
    return { status: "skipped", message: `not liked ${postUrl}` };
  }
  await likeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `unliked ${postUrl}` };
}

export async function comment(page: Page, postUrl: string, text: string): Promise<ActionResult> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const commentTrigger = page.locator('button[aria-label="Comment"]').first();
  if (await commentTrigger.isVisible().catch(() => false)) {
    await commentTrigger.click();
  }
  const box = page.locator('div.ql-editor, div[aria-label*="Text editor"], div[contenteditable="true"]').first();
  if (!(await box.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `comment box not found for ${postUrl}` };
  }
  await box.click();
  await box.fill(text);
  const postButton = page.getByRole("button", { name: /^(Comment|Post)$/i }).last();
  await postButton.click().catch(() => {});
  await page.waitForTimeout(1500);
  return { status: "success", message: `commented on ${postUrl}` };
}

export async function dm(page: Page, target: string, message: string): Promise<ActionResult> {
  await page.goto(profileUrl(target), { waitUntil: "domcontentloaded" });
  const messageButton = page.getByRole("button", { name: /^Message$/i }).first();
  if (!(await messageButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `messaging not available for ${target} (not connected)` };
  }
  await messageButton.click();

  const box = page.locator('div.msg-form__contenteditable, div[contenteditable="true"]').first();
  if (!(await box.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `message composer did not open for ${target}` };
  }
  await box.click();
  await box.fill(message);
  await box.press("Enter");
  await page.waitForTimeout(1200);
  return { status: "success", message: `sent message to ${target}` };
}
