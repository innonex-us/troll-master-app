import { closeContext, openContext } from "./browser.js";
import { detectIssue } from "./detection.js";
import * as instagram from "../platforms/instagram/actions.js";
import * as twitter from "../platforms/twitter/actions.js";
import { instagramConfig } from "../platforms/instagram/config.js";
import { twitterConfig } from "../platforms/twitter/config.js";
import type { ActionResult, ActionRunParams } from "./types.js";

function pickComment(pool?: string[]): string {
  if (!pool || pool.length === 0) return "🔥";
  return pool[Math.floor(Math.random() * pool.length)];
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
    const mod = params.platform === "instagram" ? instagram : twitter;
    const baseUrl = params.platform === "instagram" ? instagramConfig.baseUrl : twitterConfig.baseUrl;

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    const issue = await detectIssue(page, params.platform);
    if (issue) {
      return { status: issue.issue, message: issue.detail };
    }

    let result: ActionResult;
    switch (params.actionType) {
      case "follow":
        result = await mod.follow(page, params.target);
        break;
      case "unfollow":
        result = await mod.unfollow(page, params.target);
        break;
      case "like":
        result = await mod.like(page, params.target);
        break;
      case "comment":
        result = await mod.comment(page, params.target, pickComment(params.commentPool));
        break;
      default:
        result = { status: "error", message: `unknown action type: ${params.actionType}` };
    }

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
