import type { X3dOrder } from "../src/index.js";

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  /** Multipart fields of an order POST, with repeated fields as arrays. A file part is recorded as `{ name, size }`. */
  form: Record<string, unknown> | null;
  json: unknown;
}

/**
 * A stand-in for X3D's API built from its published documents, not from
 * recorded traffic. Orders POSTed get codes X3D-AAAAA1, X3D-AAAAA2... and can
 * be moved along with `set`. `failNextOrder` makes the next POST answer with
 * an error status or throw like a dropped connection.
 */
export function fakeX3d(options: { modelBytes?: string } = {}) {
  const calls: RecordedCall[] = [];
  const orders = new Map<string, X3dOrder>();
  let next = 1;
  let failure: { status: number; error: string } | "network" | null = null;
  let unpaid = false;

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.hostname !== "x3dstudios.com") {
      // A model download.
      if (url.pathname.includes("missing")) return new Response("nope", { status: 404 });
      return new Response(options.modelBytes ?? "solid model", { status: 200 });
    }
    const call: RecordedCall = { method, path: url.pathname, headers: (init?.headers ?? {}) as Record<string, string>, form: null, json: null };
    if (init?.body instanceof FormData) {
      call.form = {};
      for (const [key, value] of init.body.entries()) {
        const recorded = typeof value === "string" ? value : { name: (value as File).name, size: (value as File).size };
        call.form[key] = key in call.form ? [...[call.form[key]].flat(), recorded] : recorded;
      }
    } else if (typeof init?.body === "string") call.json = JSON.parse(init.body);
    calls.push(call);

    if (method === "POST" && url.pathname === "/api/print/orders") {
      if (failure === "network") {
        failure = null;
        throw new TypeError("fetch failed");
      }
      if (failure) {
        const reply = failure;
        failure = null;
        return new Response(JSON.stringify({ error: reply.error }), { status: reply.status });
      }
      const code = `X3D-AAAAA${next++}`;
      const status = unpaid ? "PENDING_PAYMENT" : "RECEIVED";
      orders.set(code, { code, status, paid: !unpaid, tracking: null });
      return new Response(JSON.stringify({ code, status, paid: !unpaid, estimatedCost: 19, currency: "USD", breakdown: { print: 12, shipping: 7 }, ...(unpaid ? { chargeOutcome: "not-charged", paymentUrl: "https://x3dstudios.com/pay/x" } : { charged: 19 }) }), { status: 201 });
    }
    const match = /^\/api\/print\/orders\/(.+)$/.exec(url.pathname);
    if (method === "GET" && match) {
      const order = orders.get(decodeURIComponent(match[1]!));
      return order ? new Response(JSON.stringify(order), { status: 200 }) : new Response(JSON.stringify({ error: "Order not found." }), { status: 404 });
    }
    if (method === "POST" && url.pathname === "/api/price") return new Response(JSON.stringify({ grams: 40, printHours: 2, perUnit: 4.8, subtotal: 5, shipping: 7, total: 12, pricePerGram: 0.12, customColor: false }), { status: 200 });
    throw new Error(`fakeX3d: no route for ${method} ${url.pathname}`);
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    orderPosts: () => calls.filter((call) => call.method === "POST" && call.path === "/api/print/orders"),
    set(code: string, patch: Partial<X3dOrder>) {
      orders.set(code, { ...orders.get(code)!, ...patch });
    },
    forget(code: string) {
      orders.delete(code);
    },
    failNextOrder(how: { status: number; error: string } | "network") {
      failure = how;
    },
    declineCards(value = true) {
      unpaid = value;
    },
  };
}
