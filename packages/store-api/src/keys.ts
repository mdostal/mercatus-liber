import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const STORE_API_SCOPES = ["products:read", "promotions:read", "promotions:write", "webhooks:manage"] as const;
export type StoreApiScope = (typeof STORE_API_SCOPES)[number];

/** A stored API key. Only a hash of the secret is kept, so a leaked database doesn't leak working keys. */
export interface StoreApiKey {
  id: string;
  /** Who it's for, e.g. "flayr". */
  name: string;
  /** The key's public first part, shown in the admin so a person can tell keys apart. */
  prefix: string;
  /** SHA-256 of the full key, hex. */
  hash: string;
  scopes: StoreApiScope[];
  createdAt: string;
  revokedAt: string | null;
}

export interface StoreApiKeyRepository {
  get(id: string): Promise<StoreApiKey | null>;
  getByPrefix(prefix: string): Promise<StoreApiKey | null>;
  list(): Promise<StoreApiKey[]>;
  save(key: StoreApiKey): Promise<void>;
}

const hashOf = (secret: string): string => createHash("sha256").update(secret).digest("hex");

export class InvalidScopeError extends Error {
  constructor(scope: string) {
    super(`Unknown store API scope: ${scope}`);
    this.name = "InvalidScopeError";
  }
}

/**
 * Creates a key and returns its full value once. Only the hash is stored, so
 * show `secret` to the person now: it can't be recovered later.
 */
export async function createStoreApiKey(repo: StoreApiKeyRepository, input: { name: string; scopes: string[] }): Promise<{ key: StoreApiKey; secret: string }> {
  for (const scope of input.scopes) if (!(STORE_API_SCOPES as readonly string[]).includes(scope)) throw new InvalidScopeError(scope);
  const prefix = randomBytes(6).toString("hex");
  const secret = `mlsk_${prefix}_${randomBytes(24).toString("base64url")}`;
  const key: StoreApiKey = {
    id: randomBytes(12).toString("hex"),
    name: input.name,
    prefix,
    hash: hashOf(secret),
    scopes: [...new Set(input.scopes)] as StoreApiScope[],
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
  await repo.save(key);
  return { key, secret };
}

export async function revokeStoreApiKey(repo: StoreApiKeyRepository, id: string): Promise<StoreApiKey | null> {
  const key = await repo.get(id);
  if (!key) return null;
  const revoked = { ...key, revokedAt: key.revokedAt ?? new Date().toISOString() };
  await repo.save(revoked);
  return revoked;
}

/** The key a secret belongs to, if it's well formed, exists, matches, and isn't revoked. */
export async function authenticateStoreApiKey(repo: StoreApiKeyRepository, secret: string): Promise<StoreApiKey | null> {
  const match = /^mlsk_([0-9a-f]{12})_[A-Za-z0-9_-]+$/.exec(secret);
  if (!match) return null;
  const key = await repo.getByPrefix(match[1]!);
  if (!key || key.revokedAt) return null;
  const expected = Buffer.from(key.hash, "hex");
  const actual = Buffer.from(hashOf(secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? key : null;
}

export function createInMemoryStoreApiKeyRepository(): StoreApiKeyRepository {
  const keys = new Map<string, StoreApiKey>();
  return {
    async get(id) {
      const key = keys.get(id);
      return key ? structuredClone(key) : null;
    },
    async getByPrefix(prefix) {
      const key = [...keys.values()].find((k) => k.prefix === prefix);
      return key ? structuredClone(key) : null;
    },
    async list() {
      return [...keys.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((k) => structuredClone(k));
    },
    async save(key) {
      keys.set(key.id, structuredClone(key));
    },
  };
}
