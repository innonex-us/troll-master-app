import { registerHandler, startRpcServer } from "./rpc.js";
import { runLoginCapture } from "./engine/login-capture.js";
import { runAction } from "./engine/action-runner.js";
import type { ActionRunParams, LoginCaptureParams } from "./engine/types.js";

registerHandler("ping", () => {
  return { pong: true, ts: Date.now() };
});

registerHandler("profile.loginCapture", (params) => {
  return runLoginCapture(params as LoginCaptureParams);
});

registerHandler("action.run", (params) => {
  return runAction(params as ActionRunParams);
});

startRpcServer();

process.stderr.write("[sidecar] ready\n");
