import { createInterface } from "node:readline";

export type RpcRequest = {
  id: string;
  method: string;
  params?: unknown;
};

export type RpcResponse =
  | { id: string; result: unknown }
  | { id: string; error: { code: number; message: string } };

type Handler = (params: unknown) => Promise<unknown> | unknown;

const handlers = new Map<string, Handler>();

export function registerHandler(method: string, handler: Handler): void {
  handlers.set(method, handler);
}

function send(response: RpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

export function startRpcServer(): void {
  const rl = createInterface({ input: process.stdin });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: RpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch {
      return;
    }

    const handler = handlers.get(request.method);
    if (!handler) {
      send({
        id: request.id,
        error: { code: 404, message: `unknown method: ${request.method}` },
      });
      return;
    }

    try {
      const result = await handler(request.params);
      send({ id: request.id, result });
    } catch (err) {
      send({
        id: request.id,
        error: { code: 500, message: err instanceof Error ? err.message : String(err) },
      });
    }
  });
}
