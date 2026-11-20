/**
 * Printful's rate limits: 120 requests a minute for v2 (header
 * `X-Ratelimit-Policy: 120;w=60`), 2 mockup tasks a minute for a new store. A
 * request over the limit gets HTTP 429 with `Retry-After` in seconds.
 */
export class PrintfulRateLimitError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    /** Seconds Printful asked us to wait, or null when it didn't say. */
    readonly retryAfterSeconds: number | null,
  ) {
    super(`Printful rate limit reached: ${method} ${path}. ${retryAfterSeconds !== null ? `Try again in ${retryAfterSeconds} s.` : "Try again shortly."}`);
    this.name = "PrintfulRateLimitError";
  }
}

export interface PrintfulFetchOptions {
  /** Waits this long at most before retrying a 429 once. Default 10 s; longer waits throw at once. */
  maxWaitSeconds?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch with Printful's 429 handling: waits out a short `Retry-After` and
 * tries once more, otherwise throws PrintfulRateLimitError. Other responses
 * are returned as they are.
 */
export async function printfulFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, options: PrintfulFetchOptions = {}): Promise<Response> {
  const maxWait = options.maxWaitSeconds ?? 10;
  const sleep = options.sleep ?? defaultSleep;
  const method = init.method ?? "GET";
  const path = new URL(url).pathname;
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, init);
    if (response.status !== 429) return response;
    const header = response.headers.get("retry-after");
    const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
    if (attempt > 0 || seconds === null || seconds > maxWait) throw new PrintfulRateLimitError(method, path, seconds);
    await sleep(seconds * 1000);
  }
}
