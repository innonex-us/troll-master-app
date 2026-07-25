import { registerHandler, startRpcServer } from "./rpc.js";
import { runLoginCapture, runAutoLogin } from "./engine/login-capture.js";
import { runAction } from "./engine/action-runner.js";
import { runScrape } from "./engine/scrape-runner.js";
import { runMonitorScrape } from "./engine/monitor-runner.js";
import { runOwnLatestPost } from "./engine/own-post-runner.js";
import { runOwnStats } from "./engine/own-stats-runner.js";
import { runPublishPost } from "./engine/publish-runner.js";
import type {
  ActionRunParams,
  AutoLoginParams,
  LoginCaptureParams,
  MonitorParams,
  OwnPostParams,
  OwnStatsParams,
  PublishPostParams,
  ScrapeParams,
} from "./engine/types.js";

registerHandler("ping", () => {
  return { pong: true, ts: Date.now() };
});

registerHandler("profile.loginCapture", (params) => {
  return runLoginCapture(params as LoginCaptureParams);
});

registerHandler("profile.autoLogin", (params) => {
  return runAutoLogin(params as AutoLoginParams);
});

registerHandler("action.run", (params) => {
  return runAction(params as ActionRunParams);
});

registerHandler("targets.scrape", (params) => {
  return runScrape(params as ScrapeParams);
});

registerHandler("monitor.scrapeMetrics", (params) => {
  return runMonitorScrape(params as MonitorParams);
});

registerHandler("own.latestPost", (params) => {
  return runOwnLatestPost(params as OwnPostParams);
});

registerHandler("own.stats", (params) => {
  return runOwnStats(params as OwnStatsParams);
});

registerHandler("post.publish", (params) => {
  return runPublishPost(params as PublishPostParams);
});

startRpcServer();

process.stderr.write("[sidecar] ready\n");
