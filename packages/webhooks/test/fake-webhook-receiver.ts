import { createServer, type Server } from "node:http";

export interface ReceivedRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

/**
 * A real local HTTP server (node:http, a real socket -- not a mocked
 * fetch/axios client) standing in for an external webhook receiver, per
 * this epic's own requirement to test against a fake local server rather
 * than a live network call. `statusSequence` lets a test simulate a
 * receiver that fails N times before succeeding (e.g. [500, 500, 200]) --
 * each request pops the next status off the sequence; once exhausted, the
 * last entry repeats (so a test asserting "fails every time" only needs
 * [500]).
 */
export function createFakeWebhookReceiver(statusSequence: number[] = [200]): {
  url: Promise<string>;
  requests: ReceivedRequest[];
  close: () => Promise<void>;
  server: Server;
} {
  const requests: ReceivedRequest[] = [];
  let callCount = 0;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf-8");
      requests.push({ headers: req.headers as Record<string, string | string[] | undefined>, rawBody });

      const status = statusSequence[Math.min(callCount, statusSequence.length - 1)];
      callCount++;
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ received: true }));
    });
  });

  const url = new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("expected a real AddressInfo from server.listen");
      resolve(`http://127.0.0.1:${address.port}/webhook`);
    });
  });

  return {
    url,
    requests,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
