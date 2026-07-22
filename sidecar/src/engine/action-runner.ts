import type { Page } from "playwright";
import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { resolveSpintax } from "./spintax.js";
import * as instagram from "../platforms/instagram/actions.js";
import * as twitter from "../platforms/twitter/actions.js";
import * as facebook from "../platforms/facebook/actions.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import type { ActionResult, ActionRunParams } from "./types.js";

function pickComment(pool?: string[]): string {
  if (!pool || pool.length === 0) return "🔥";
  return resolveSpintax(pool[Math.floor(Math.random() * pool.length)]);
}

function pickDmMessage(template?: string): string {
  return resolveSpintax(template && template.trim() ? template : "Hey {there|!} 👋");
}

async function dispatchInstagram(page: Page, params: ActionRunParams): Promise<ActionResult> {
  switch (params.actionType) {
    case "follow":
      return instagram.follow(page, params.target);
    case "unfollow":
      return instagram.unfollow(page, params.target);
    case "like":
      return instagram.like(page, params.target);
    case "unlike":
      return instagram.unlike(page, params.target);
    case "comment":
      return instagram.comment(page, params.target, pickComment(params.commentPool));
    case "save":
      return instagram.save(page, params.target);
    case "view_story":
      return instagram.viewStory(page, params.target);
    case "dm":
      return instagram.dm(page, params.target, pickDmMessage(params.dmMessage));
    default:
      return { status: "error", message: `unsupported Instagram action: ${params.actionType}` };
  }
}

async function dispatchTwitter(page: Page, params: ActionRunParams): Promise<ActionResult> {
  switch (params.actionType) {
    case "follow":
      return twitter.follow(page, params.target);
    case "unfollow":
      return twitter.unfollow(page, params.target);
    case "like":
      return twitter.like(page, params.target);
    case "unlike":
      return twitter.unlike(page, params.target);
    case "comment":
      return twitter.comment(page, params.target, pickComment(params.commentPool));
    case "retweet":
      return twitter.retweet(page, params.target);
    case "unretweet":
      return twitter.unretweet(page, params.target);
    case "dm":
      return twitter.dm(page, params.target, pickDmMessage(params.dmMessage));
    default:
      return { status: "error", message: `unsupported X/Twitter action: ${params.actionType}` };
  }
}

async function dispatchFacebook(page: Page, params: ActionRunParams): Promise<ActionResult> {
  switch (params.actionType) {
    case "follow":
      return facebook.follow(page, params.target);
    case "unfollow":
      return facebook.unfollow(page, params.target);
    case "like":
      return facebook.like(page, params.target);
    case "unlike":
      return facebook.unlike(page, params.target);
    case "comment":
      return facebook.comment(page, params.target, pickComment(params.commentPool));
    case "dm":
      return facebook.dm(page, params.target, pickDmMessage(params.dmMessage));
    default:
      return { status: "error", message: `unsupported Facebook action: ${params.actionType}` };
  }
}

export async function runAction(params: ActionRunParams): Promise<ActionResult> {
  const opened = await openContext({
    headless: true,
    proxy: params.proxy,
    fingerprint: params.fingerprint,
    storageStatePlainPath: params.storageStatePlainPath,
  });

  try {
    const page = await opened.context.newPage();
    const baseUrl =
      params.platform === "instagram"
        ? instagramConfig.baseUrl
        : params.platform === "twitter"
          ? twitterConfig.baseUrl
          : facebookConfig.baseUrl;

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    const issue = await detectIssue(page, params.platform);
    if (issue) {
      return { status: issue.issue, message: issue.detail };
    }

    const result =
      params.platform === "instagram"
        ? await dispatchInstagram(page, params)
        : params.platform === "twitter"
          ? await dispatchTwitter(page, params)
          : await dispatchFacebook(page, params);

    // persist any refreshed cookies/tokens back to the same plaintext path;
    // the Rust core re-encrypts it and deletes this plaintext copy afterwards.
    await opened.context.storageState({ path: params.storageStatePlainPath }).catch(() => {});

    return result;
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    await closeContext(opened);
  }
}
