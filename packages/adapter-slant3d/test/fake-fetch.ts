export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status?: number; json?: unknown; text?: string };

/**
 * A fetch stand-in: answers each request from `routes` ("METHOD /path" -> reply
 * or function) and records what was sent. Unrouted requests fail the test.
 */
export function fakeFetch(routes: Record<string, Reply | ((call: RecordedCall) => Reply)>): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const rawBody = init?.body;
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    const call: RecordedCall = { method, url, headers: (init?.headers ?? {}) as Record<string, string>, body };
    calls.push(call);
    const path = url.replace("https://slant3dapi.com/v2/api", "");
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`fakeFetch: no route for ${method} ${path}`);
    const reply = typeof route === "function" ? route(call) : route;
    return new Response(reply.text ?? JSON.stringify(reply.json ?? null), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export const ok = (data: unknown, status = 200): Reply => ({ status, json: { success: true, message: "ok", data } });
