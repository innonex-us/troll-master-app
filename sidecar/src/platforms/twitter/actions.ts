import type { Page } from "playwright";
import { twitterConfig } from "./config.js";
import type { ActionResult } from "../../engine/types.js";

function profileUrl(username: string): string {
  return `${twitterConfig.baseUrl}/${username.replace(/^@/, "")}`;
}

export async function follow(page: Page, username: string): Promise<ActionResult> {
  await page.goto(profileUrl(username), { waitUntil: "domcontentloaded" });
  const followButton = page.locator('[data-testid$="-follow"]').first();
  if (!(await followButton.isVisible().catch(() => false))) {
    const alreadyFollowing = await page
      .locator('[data-testid$="-unfollow"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyFollowing) {
      return { status: "skipped", message: `already following ${username}` };
    }
    return { status: "error", message: `follow button not found for ${username}` };
  }
  await followButton.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `followed ${username}` };
}

export async function unfollow(page: Page, username: string): Promise<ActionResult> {
  await page.goto(profileUrl(username), { waitUntil: "domcontentloaded" });
  const unfollowButton = page.locator('[data-testid$="-unfollow"]').first();
  if (!(await unfollowButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not following ${username}` };
  }

  const followsYou = await page.getByText(/Follows you/i).first().isVisible().catch(() => false);
  if (followsYou) {
    return { status: "skipped", message: `${username} now follows back, kept` };
  }

  await unfollowButton.click();
  const confirm = page.locator('[data-testid="confirmationSheetConfirm"]').first();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `unfollowed ${username}` };
}

export async function like(page: Page, tweetUrl: string): Promise<ActionResult> {
  await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
  const likeButton = page.locator('[data-testid="like"]').first();
  if (!(await likeButton.isVisible().catch(() => false))) {
    const alreadyLiked = await page
      .locator('[data-testid="unlike"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyLiked) {
      return { status: "skipped", message: `already liked ${tweetUrl}` };
    }
    return { status: "error", message: `like button not found for ${tweetUrl}` };
  }
  await likeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `liked ${tweetUrl}` };
}

export async function comment(page: Page, tweetUrl: string, text: string): Promise<ActionResult> {
  await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
  const replyButton = page.locator('[data-testid="reply"]').first();
  if (!(await replyButton.isVisible().catch(() => false))) {
    return { status: "error", message: `reply button not found for ${tweetUrl}` };
  }
  await replyButton.click();
  const box = page.locator('[data-testid="tweetTextarea_0"]').first();
  await box.waitFor({ state: "visible", timeout: 5000 });
  await box.fill(text);
  const sendButton = page.locator('[data-testid="tweetButton"]').first();
  await sendButton.click();
  await page.waitForTimeout(1500);
  return { status: "success", message: `commented on ${tweetUrl}` };
}

export async function unlike(page: Page, tweetUrl: string): Promise<ActionResult> {
  await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
  const unlikeButton = page.locator('[data-testid="unlike"]').first();
  if (!(await unlikeButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not liked ${tweetUrl}` };
  }
  await unlikeButton.click();
  await page.waitForTimeout(1000);
  return { status: "success", message: `unliked ${tweetUrl}` };
}

export async function retweet(page: Page, tweetUrl: string): Promise<ActionResult> {
  await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
  const retweetButton = page.locator('[data-testid="retweet"]').first();
  if (!(await retweetButton.isVisible().catch(() => false))) {
    const alreadyRetweeted = await page
      .locator('[data-testid="unretweet"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (alreadyRetweeted) {
      return { status: "skipped", message: `already retweeted ${tweetUrl}` };
    }
    return { status: "error", message: `retweet button not found for ${tweetUrl}` };
  }
  await retweetButton.click();
  const confirm = page.locator('[data-testid="retweetConfirm"]').first();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `retweeted ${tweetUrl}` };
}

export async function unretweet(page: Page, tweetUrl: string): Promise<ActionResult> {
  await page.goto(tweetUrl, { waitUntil: "domcontentloaded" });
  const unretweetButton = page.locator('[data-testid="unretweet"]').first();
  if (!(await unretweetButton.isVisible().catch(() => false))) {
    return { status: "skipped", message: `not retweeted ${tweetUrl}` };
  }
  await unretweetButton.click();
  const confirm = page.locator('[data-testid="unretweetConfirm"]').first();
  await confirm.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  return { status: "success", message: `unretweeted ${tweetUrl}` };
}

export async function dm(page: Page, username: string, message: string): Promise<ActionResult> {
  await page.goto(profileUrl(username), { waitUntil: "domcontentloaded" });
  const messageButton = page.locator('[data-testid="sendDMFromProfile"]').first();
  if (!(await messageButton.isVisible().catch(() => false))) {
    return { status: "error", message: `message button not found for ${username} (DMs may be closed)` };
  }
  await messageButton.click();

  const box = page.locator('[data-testid="dmComposerTextInput"]').first();
  if (!(await box.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    return { status: "error", message: `DM composer did not open for ${username}` };
  }
  await box.click();
  await box.fill(message);
  const sendButton = page.locator('[data-testid="dmComposerSendButton"]').first();
  await sendButton.click();
  await page.waitForTimeout(1200);
  return { status: "success", message: `sent DM to ${username}` };
}
