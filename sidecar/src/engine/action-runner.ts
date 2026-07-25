import type { Page } from "playwright";
import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import { preActionIdle } from "./humanize.js";
import { resolveSpintax } from "./spintax.js";
import * as instagram from "../platforms/instagram/actions.js";
import * as twitter from "../platforms/twitter/actions.js";
import * as facebook from "../platforms/facebook/actions.js";
import * as tiktok from "../platforms/tiktok/actions.js";
import * as linkedin from "../platforms/linkedin/actions.js";
import * as youtube from "../platforms/youtube/actions.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import { facebookConfig } from "../platforms/facebook/config.js";
import { tiktokConfig } from "../platforms/tiktok/config.js";
import { linkedinConfig } from "../platforms/linkedin/config.js";
import { youtubeConfig } from "../platforms/youtube/config.js";
import type { ActionResult, ActionRunParams, Platform } from "./types.js";

function pickComment(pool?: string[]): string {
  if (!pool || pool.length === 0) return "🔥";
  return resolveSpintax(pool[Math.floor(Math.random() * pool.length)]);
}

function pickDmMessage(template?: string): string {
  return resolveSpintax(template && template.trim() ? template : "Hey {there|!} 👋");
}

/**
 * `reply_comment` targets are composite strings `<postUrl>#c:<commentId>` so the
 * Rust side can log/de-dupe per-comment while the sidecar only needs the post
 * URL. Precisely threading a reply to one specific commenter is unreliable
 * across these platforms' shifting DOMs, so this posts the reply as a new
 * top-level comment on the same post via the platform's existing `comment()` —
 * not threaded to the original commenter's reply chain.
 */
function postUrlFromReplyTarget(target: string): string {
  return target.split("#c:")[0];
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
    case "react_story":
      return instagram.reactStory(page, params.target, params.reactionType ?? "like", pickComment(params.commentPool));
    case "dm":
      return instagram.dm(page, params.target, pickDmMessage(params.dmMessage));
    case "reply_comment":
      return instagram.comment(page, postUrlFromReplyTarget(params.target), pickComment(params.commentPool));
    case "block":
      return instagram.block(page, params.target);
    case "mute":
      return instagram.mute(page, params.target);
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
    case "reply_comment":
      return twitter.comment(page, postUrlFromReplyTarget(params.target), pickComment(params.commentPool));
    case "block":
      return twitter.block(page, params.target);
    case "mute":
      return twitter.mute(page, params.target);
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
    case "reply_comment":
      return facebook.comment(page, postUrlFromReplyTarget(params.target), pickComment(params.commentPool));
    case "block":
      return facebook.block(page, params.target);
    default:
      return { status: "error", message: `unsupported Facebook action: ${params.actionType}` };
  }
}

const BASE_URL: Record<Platform, string> = {
  instagram: instagramConfig.baseUrl,
  twitter: twitterConfig.baseUrl,
  facebook: facebookConfig.baseUrl,
  tiktok: tiktokConfig.baseUrl,
  linkedin: linkedinConfig.baseUrl,
  youtube: youtubeConfig.baseUrl,
};

const DISPATCH: Record<Platform, (page: Page, params: ActionRunParams) => Promise<ActionResult>> = {
  instagram: dispatchInstagram,
  twitter: dispatchTwitter,
  facebook: dispatchFacebook,
  tiktok: dispatchTiktok,
  linkedin: dispatchLinkedin,
  youtube: dispatchYoutube,
};

async function dispatchTiktok(page: Page, params: ActionRunParams): Promise<ActionResult> {
  switch (params.actionType) {
    case "follow":
      return tiktok.follow(page, params.target);
    case "unfollow":
      return tiktok.unfollow(page, params.target);
    case "like":
      return tiktok.like(page, params.target);
    case "unlike":
      return tiktok.unlike(page, params.target);
    case "comment":
      return tiktok.comment(page, params.target, pickComment(params.commentPool));
    case "save":
      return tiktok.save(page, params.target);
    case "view_story":
      return tiktok.viewStory(page, params.target);
    case "react_story":
      return tiktok.reactStory(page, params.target, params.reactionType ?? "like", pickComment(params.commentPool));
    case "dm":
      return tiktok.dm(page, params.target, pickDmMessage(params.dmMessage));
    case "reply_comment":
      return tiktok.comment(page, postUrlFromReplyTarget(params.target), pickComment(params.commentPool));
    case "block":
      return tiktok.block(page, params.target);
    case "watch_video":
      return tiktok.watchVideo(page, params.target);
    default:
      return { status: "error", message: `unsupported TikTok action: ${params.actionType}` };
  }
}

async function dispatchLinkedin(page: Page, params: ActionRunParams): Promise<ActionResult> {
  switch (params.actionType) {
    case "follow":
      return linkedin.follow(page, params.target);
    case "unfollow":
      return linkedin.unfollow(page, params.target);
    case "like":
      return linkedin.like(page, params.target);
    case "unlike":
      return linkedin.unlike(page, params.target);
    case "comment":
      return linkedin.comment(page, params.target, pickComment(params.commentPool));
    case "dm":
      return linkedin.dm(page, params.target, pickDmMessage(params.dmMessage));
    case "reply_comment":
      return linkedin.comment(page, postUrlFromReplyTarget(params.target), pickComment(params.commentPool));
    default:
      return { status: "error", message: `unsupported LinkedIn action: ${params.actionType}` };
  }
}

async function dispatchYoutube(page: Page, params: ActionRunParams): Promise<ActionResult> {
  switch (params.actionType) {
    case "follow":
      return youtube.follow(page, params.target);
    case "unfollow":
      return youtube.unfollow(page, params.target);
    case "like":
      return youtube.like(page, params.target);
    case "unlike":
      return youtube.unlike(page, params.target);
    case "comment":
      return youtube.comment(page, params.target, pickComment(params.commentPool));
    case "view_story":
      return youtube.viewStory(page, params.target);
    case "react_story":
      return youtube.reactStory(page, params.target, params.reactionType ?? "like", pickComment(params.commentPool));
    case "dm":
      return youtube.dm(page, params.target, pickDmMessage(params.dmMessage));
    case "reply_comment":
      return youtube.comment(page, postUrlFromReplyTarget(params.target), pickComment(params.commentPool));
    case "watch_video":
      return youtube.watchVideo(page, params.target);
    default:
      return { status: "error", message: `unsupported YouTube action: ${params.actionType}` };
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
    const baseUrl = BASE_URL[params.platform];

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    const issue = await detectIssue(page, params.platform);
    if (issue) {
      return { status: issue.issue, message: issue.detail };
    }

    // Human-like idle before acting: scroll, mouse drift, think pause.
    if (params.humanize !== false) {
      await preActionIdle(page);
    }

    const result = await DISPATCH[params.platform](page, params);

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
