import { authenticateStoreApiKey, type StoreApiKeyRepository, type StoreApiScope } from "./keys.js";
import { isPromotionLive, toApiProduct } from "./products.js";
import type { StoreApiDeps, StoreApiPromotion, StoreApiPromotionInput } from "./types.js";

export interface StoreApiHandlerConfig {
  deps: StoreApiDeps;
  keys: StoreApiKeyRepository;
  /** The path the API is mounted at, e.g. "/api/store/v1". Requests outside it get 404. */
  basePath: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const PAGE_MAX = 100;

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const text = /^[A-Za-z0-9_-]+$/.test(cursor) ? Buffer.from(cursor, "base64url").toString() : "";
  const offset = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, "invalid_cursor", "The cursor isn't valid.");
  return offset;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "invalid_body", "Send a JSON object.");
}

const DATE = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new HttpError(400, "invalid_field", `${field} must be an ISO 8601 date or null.`);
  return new Date(value).toISOString();
};

/** Validates a promotion write. `partial` allows any subset, for PATCH. */
function promotionInput(body: Record<string, unknown>, currency: string, partial: boolean): Partial<StoreApiPromotionInput> & { status?: "active" | "inactive" } {
  const out: Partial<StoreApiPromotionInput> & { status?: "active" | "inactive" } = {};
  const has = (k: string): boolean => Object.hasOwn(body, k);
  const need = (k: string): void => {
    if (!partial && !has(k)) throw new HttpError(400, "missing_field", `${k} is required.`);
  };
  need("kind");
  need("value");
  if (has("kind")) {
    if (body.kind !== "percentage" && body.kind !== "fixed") throw new HttpError(400, "invalid_field", 'kind must be "percentage" or "fixed".');
    out.kind = body.kind;
  }
  if (has("value")) {
    if (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value <= 0) throw new HttpError(400, "invalid_field", "value must be a positive number.");
    out.value = body.value;
  }
  const kind = out.kind ?? (body.kind as string | undefined);
  if (kind === "percentage" && out.value !== undefined && out.value > 100) throw new HttpError(400, "invalid_field", "A percentage can't be over 100.");
  if (kind === "fixed" && out.value !== undefined && !Number.isInteger(out.value)) throw new HttpError(400, "invalid_field", "A fixed amount is in whole cents.");
  if (has("code")) {
    if (body.code !== null && (typeof body.code !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(body.code))) throw new HttpError(400, "invalid_field", "code must be 3 to 40 letters, digits, - or _, or null for an automatic discount.");
    out.code = body.code as string | null;
  } else if (!partial) out.code = null;
  if (has("targetSkuIds")) {
    if (!Array.isArray(body.targetSkuIds) || !body.targetSkuIds.every((s) => typeof s === "string")) throw new HttpError(400, "invalid_field", "targetSkuIds must be a list of SKU ids.");
    out.targetSkuIds = body.targetSkuIds as string[];
  } else if (!partial) out.targetSkuIds = [];
  if (!partial || has("targetSkuIds")) out.scope = (out.targetSkuIds ?? []).length > 0 ? "product" : "cart";
  if (has("startsAt") || !partial) out.startsAt = DATE(body.startsAt, "startsAt");
  if (has("endsAt") || !partial) out.endsAt = DATE(body.endsAt, "endsAt");
  if (out.startsAt && out.endsAt && out.endsAt <= out.startsAt) throw new HttpError(400, "invalid_field", "endsAt must be after startsAt.");
  if (has("usageLimit")) {
    if (body.usageLimit !== null && (!Number.isInteger(body.usageLimit) || (body.usageLimit as number) < 1)) throw new HttpError(400, "invalid_field", "usageLimit must be a positive whole number or null.");
    out.usageLimit = body.usageLimit as number | null;
  } else if (!partial) out.usageLimit = null;
  if (has("minCartAmountCents")) {
    if (body.minCartAmountCents !== null && (!Number.isInteger(body.minCartAmountCents) || (body.minCartAmountCents as number) < 0)) throw new HttpError(400, "invalid_field", "minCartAmountCents must be whole cents or null.");
    out.minCartAmount = body.minCartAmountCents === null ? null : { amount: body.minCartAmountCents as number, currency };
  } else if (!partial) out.minCartAmount = null;
  if (has("status")) {
    if (body.status !== "active" && body.status !== "inactive") throw new HttpError(400, "invalid_field", 'status must be "active" or "inactive".');
    out.status = body.status;
  } else if (!partial) out.status = "inactive";
  if (!partial) out.currency = currency;
  return out;
}

const publicPromotion = (p: StoreApiPromotion, now: Date) => ({ ...p, live: isPromotionLive(p, now) });

/**
 * The store API as one fetch-style handler. Mount it wherever the store serves
 * routes; in Next.js, export it from a catch-all route under `basePath`.
 */
export function createStoreApiHandler(config: StoreApiHandlerConfig): (request: Request) => Promise<Response> {
  const { deps, keys } = config;
  const base = config.basePath.replace(/\/$/, "");

  return async (request) => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(base)) throw new HttpError(404, "not_found", "No such endpoint.");
      const parts = url.pathname.slice(base.length).split("/").filter(Boolean);

      const auth = request.headers.get("authorization") ?? "";
      const key = auth.startsWith("Bearer ") ? await authenticateStoreApiKey(keys, auth.slice(7).trim()) : null;
      if (!key) throw new HttpError(401, "unauthorized", "Send a valid store API key as a Bearer token.");
      const requireScope = (scope: StoreApiScope): void => {
        if (!key.scopes.includes(scope)) throw new HttpError(403, "forbidden", `This key needs the ${scope} scope.`);
      };
      const now = deps.now?.() ?? new Date();
      const route = `${request.method} /${parts.map((p, i) => (i > 0 ? ":id" : p)).join("/")}`;

      switch (route) {
        case "GET /store":
          return json(200, { name: deps.store.name, currency: deps.store.currency, url: deps.store.url, scopes: key.scopes });

        case "GET /products": {
          requireScope("products:read");
          const status = url.searchParams.get("status") ?? "active";
          if (!["active", "draft", "archived", "all"].includes(status)) throw new HttpError(400, "invalid_query", "status must be active, draft, archived, or all.");
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, PAGE_MAX);
          const offset = decodeCursor(url.searchParams.get("cursor"));
          const all = (await deps.catalog.listProducts(status === "all" ? undefined : { status: status as "active" })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const promotions = deps.promotions ? await deps.promotions.listPromotions() : [];
          const page = await Promise.all(all.slice(offset, offset + limit).map((p) => toApiProduct(deps, p, promotions)));
          const next = offset + limit < all.length ? encodeCursor(offset + limit) : null;
          return json(200, { data: page, nextCursor: next, total: all.length });
        }

        case "GET /products/:id": {
          requireScope("products:read");
          const product = await deps.catalog.getProduct(parts[1]!);
          if (!product) throw new HttpError(404, "not_found", "No such product.");
          const promotions = deps.promotions ? await deps.promotions.listPromotions() : [];
          return json(200, { data: await toApiProduct(deps, product, promotions) });
        }

        case "GET /categories": {
          requireScope("products:read");
          if (!deps.categories) throw new HttpError(404, "not_supported", "This store doesn't expose categories.");
          return json(200, { data: await deps.categories.listCategories() });
        }

        case "GET /promotions": {
          requireScope("promotions:read");
          if (!deps.promotions) throw new HttpError(404, "not_supported", "This store doesn't expose promotions.");
          return json(200, { data: (await deps.promotions.listPromotions()).map((p) => publicPromotion(p, now)) });
        }

        case "POST /promotions": {
          requireScope("promotions:write");
          if (!deps.promotions) throw new HttpError(404, "not_supported", "This store doesn't expose promotions.");
          const input = promotionInput(await readBody(request), deps.store.currency, false) as StoreApiPromotionInput;
          if (input.code) {
            const clash = (await deps.promotions.listPromotions()).find((p) => p.code?.toLowerCase() === input.code!.toLowerCase());
            if (clash) throw new HttpError(409, "code_taken", `The code ${input.code} is already in use.`);
          }
          return json(201, { data: publicPromotion(await deps.promotions.createPromotion(input), now) });
        }

        case "PATCH /promotions/:id": {
          requireScope("promotions:write");
          if (!deps.promotions) throw new HttpError(404, "not_supported", "This store doesn't expose promotions.");
          const existing = await deps.promotions.getPromotion(parts[1]!);
          if (!existing) throw new HttpError(404, "not_found", "No such promotion.");
          const body = await readBody(request);
          const patch = promotionInput({ kind: existing.kind, ...body }, deps.store.currency, true);
          const startsAt = patch.startsAt !== undefined ? patch.startsAt : existing.startsAt;
          const endsAt = patch.endsAt !== undefined ? patch.endsAt : existing.endsAt;
          if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, "invalid_field", "endsAt must be after startsAt.");
          if (patch.code) {
            const clash = (await deps.promotions.listPromotions()).find((p) => p.id !== existing.id && p.code?.toLowerCase() === patch.code!.toLowerCase());
            if (clash) throw new HttpError(409, "code_taken", `The code ${patch.code} is already in use.`);
          }
          const updated = await deps.promotions.updatePromotion(existing.id, patch);
          return json(200, { data: publicPromotion(updated!, now) });
        }

        case "GET /webhooks": {
          requireScope("webhooks:manage");
          if (!deps.webhooks) throw new HttpError(404, "not_supported", "This store doesn't support webhooks.");
          return json(200, { data: (await deps.webhooks.list()).map(({ secret: _secret, ...rest }) => rest) });
        }

        case "POST /webhooks": {
          requireScope("webhooks:manage");
          if (!deps.webhooks) throw new HttpError(404, "not_supported", "This store doesn't support webhooks.");
          const body = await readBody(request);
          let target: URL;
          try {
            target = new URL(String(body.url));
          } catch {
            throw new HttpError(400, "invalid_field", "url must be an absolute https URL.");
          }
          if (target.protocol !== "https:") throw new HttpError(400, "invalid_field", "url must be an absolute https URL.");
          if (!Array.isArray(body.eventTypes) || body.eventTypes.length === 0 || !body.eventTypes.every((e) => typeof e === "string")) throw new HttpError(400, "invalid_field", "eventTypes must be a non-empty list.");
          const created = await deps.webhooks.create({ url: target.toString(), eventTypes: body.eventTypes as string[] });
          // The secret is returned once, for verifying deliveries, and never listed again.
          return json(201, { data: created });
        }

        case "DELETE /webhooks/:id": {
          requireScope("webhooks:manage");
          if (!deps.webhooks) throw new HttpError(404, "not_supported", "This store doesn't support webhooks.");
          await deps.webhooks.delete(parts[1]!);
          return new Response(null, { status: 204 });
        }

        default:
          throw new HttpError(404, "not_found", "No such endpoint.");
      }
    } catch (error) {
      if (error instanceof HttpError) return json(error.status, { error: { code: error.code, message: error.message } });
      return json(500, { error: { code: "internal", message: "Something went wrong on the store's side." } });
    }
  };
}
