import type { SimplyPrintQueueItem, SimplyPrintQueueSlice } from "../src/index.js";

export interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  json: unknown;
}

export const FAKE_COMPANY_ID = "5152";
export const FAKE_API_KEY = "sp_made_up_key";

type AddFailure = { httpStatus: number; message: string; retryAfter?: number } | "network" | "status-false" | "no-id";

/**
 * A stand-in for the SimplyPrint endpoints this package calls, built from
 * SimplyPrint's API reference: the paths, the `X-API-KEY` header, the
 * `{ status, message }` envelope, `created_id` from queue/AddItem, and the
 * `queue` / `page_amount` shape of queue/GetPaginatedItems. It is not
 * SimplyPrint: it shows the adapter sends what the documents ask for, not that
 * SimplyPrint behaves as documented.
 */
export function fakeSimplyPrint(options: { maxPageSize?: number; idField?: "created_id" | "id" } = {}) {
  const calls: RecordedCall[] = [];
  const items = new Map<number, { slice: SimplyPrintQueueSlice; item: SimplyPrintQueueItem }>();
  let nextId = 430001;
  let addFailure: AddFailure | null = null;
  let noteFailure = false;
  let listFailure = false;

  const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const prefix = `/${FAKE_COMPANY_ID}`;
    if (!url.pathname.startsWith(`${prefix}/`)) throw new Error(`fakeSimplyPrint: wrong company in ${url.pathname}`);
    const path = url.pathname.slice(prefix.length);
    const query = Object.fromEntries(url.searchParams.entries());
    calls.push({ method, path, query, headers, json: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    if (headers["X-API-KEY"] !== FAKE_API_KEY) return reply({ status: false, message: "No API key provided, or not logged in" }, 401);

    if (method === "POST" && path === "/queue/AddItem") {
      const failure = addFailure;
      addFailure = null;
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure === "status-false") return reply({ status: false, message: "File not found" });
      if (failure && failure !== "no-id") return reply({ status: false, message: failure.message }, failure.httpStatus, failure.retryAfter !== undefined ? { "Retry-After": String(failure.retryAfter) } : {});
      const body = JSON.parse(String(init?.body)) as { amount?: number; group?: number };
      const id = nextId++;
      items.set(id, { slice: "active", item: { id, filename: "part.3mf", note: null, left: body.amount ?? 1, printed: 0, group: body.group ?? 0, is_done: false, paused: false, ongoing: 0, failed: 0 } });
      if (failure === "no-id") return reply({ status: true, message: null });
      return reply({ status: true, message: null, [options.idField ?? "created_id"]: id });
    }
    if (method === "POST" && path === "/queue/UpdateItem") {
      if (noteFailure) {
        noteFailure = false;
        return reply({ status: false, message: "You do not have permission to do this" }, 403);
      }
      const entry = items.get(Number(query.job));
      if (!entry) return reply({ status: false, message: "Queue item not found" });
      entry.item.note = (JSON.parse(String(init?.body)) as { note: string }).note;
      return reply({ status: true, message: null });
    }
    if (method === "GET" && path === "/queue/DeleteItem") {
      if (!items.delete(Number(query.job))) return reply({ status: false, message: "Queue item not found" });
      return reply({ status: true, message: null });
    }
    if (method === "GET" && path === "/queue/GetPaginatedItems") {
      if (listFailure) {
        listFailure = false;
        return reply({ status: false, message: "You have reached the API rate limit" }, 429);
      }
      const slice = query.filter ?? "active";
      const pageSize = Math.min(Number(query.page_size ?? 50), options.maxPageSize ?? 200);
      const page = Number(query.page ?? 1);
      const matching = [...items.values()].filter((entry) => entry.slice === slice).map((entry) => entry.item);
      return reply({ status: true, message: null, queue: matching.slice((page - 1) * pageSize, page * pageSize), page, page_size: pageSize, total: matching.length, page_amount: Math.max(1, Math.ceil(matching.length / pageSize)), next_cursor: null });
    }
    throw new Error(`fakeSimplyPrint: no route for ${method} ${path}`);
  }) as typeof fetch;

  const callsTo = (path: string) => calls.filter((call) => call.path === path);

  return {
    fetchImpl,
    calls,
    adds: () => callsTo("/queue/AddItem"),
    notes: () => callsTo("/queue/UpdateItem"),
    lists: () => callsTo("/queue/GetPaginatedItems"),
    deletes: () => callsTo("/queue/DeleteItem"),
    item: (id: string | number) => items.get(Number(id))?.item ?? null,
    /** Changes a queue item's fields, and optionally the slice it is listed in. */
    set(id: string | number, patch: Partial<SimplyPrintQueueItem>, slice?: SimplyPrintQueueSlice) {
      const entry = items.get(Number(id))!;
      items.set(Number(id), { slice: slice ?? entry.slice, item: { ...entry.item, ...patch } });
    },
    /** What SimplyPrint does when every copy is printed: the item moves to the done list. */
    finish(id: string | number) {
      const entry = items.get(Number(id))!;
      items.set(Number(id), { slice: "done", item: { ...entry.item, is_done: true, ongoing: 0, printed: (entry.item.printed ?? 0) + (entry.item.left ?? 0), left: 0 } });
    },
    /** Removes the item without telling anyone, as a deletion in the panel or an expired done entry would. */
    vanish(id: string | number) {
      items.delete(Number(id));
    },
    failNextAdd(how: AddFailure) {
      addFailure = how;
    },
    failNextNote() {
      noteFailure = true;
    },
    failNextList() {
      listFailure = true;
    },
  };
}
