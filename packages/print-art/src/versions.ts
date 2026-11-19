/**
 * Versioned print art: the words and choices that go into a custom print (a
 * shirt back, a sticker sheet), kept as immutable numbered versions.
 *
 * A store's code holds the versions it may sell, so every environment can
 * render them. An editor can save more versions, which are numbered after the
 * code's and kept in storage. No version ever changes once it exists, so a
 * print file whose URL names a version always shows the same art: orders keep
 * printing what they were bought with, and a provider's cache stays correct.
 */
export interface ArtVersion<T> {
  version: number;
  /** The art's content: a template-specific object, such as headline lines and a URL. */
  copy: T;
  /** Why this version exists: who chose it, what it changed. */
  note: string;
}

/** The versions written in a store's code, per art id, oldest first. */
export type CodeArtVersions<T> = Readonly<Record<string, readonly ArtVersion<T>[]>>;

export interface ArtVersionStore<T> {
  /** Code versions, then saved ones, oldest first. Empty for an unknown art id. */
  list(artId: string): Promise<ArtVersion<T>[]>;
  get(artId: string, version: number): Promise<ArtVersion<T> | null>;
  /** Saves `copy` as the art's next version and returns it. Only art ids that have code versions can be saved to. */
  save(artId: string, copy: T, note: string): Promise<ArtVersion<T>>;
  /** True when the store's code has versions for this art id. */
  isKnownArt(artId: string): boolean;
}

/**
 * Where saved versions live. `insert` must refuse a version number that is
 * already taken by throwing `ArtVersionTakenError`: two editors saving at once
 * pick the same next number, and the store retries the loser once.
 */
export interface SavedArtVersionRepository<T> {
  /** Saved versions of one art id, oldest first. */
  list(artId: string): Promise<ArtVersion<T>[]>;
  insert(artId: string, version: ArtVersion<T>): Promise<void>;
}

export class UnknownArtError extends Error {
  constructor(readonly artId: string) {
    super(`Unknown art "${artId}": only art with versions in code can be saved to.`);
    this.name = "UnknownArtError";
  }
}

export class ArtVersionTakenError extends Error {
  constructor(readonly artId: string, readonly version: number) {
    super(`Version ${version} of art "${artId}" already exists.`);
    this.name = "ArtVersionTakenError";
  }
}

const isTaken = (err: unknown): boolean => err instanceof ArtVersionTakenError || (err as { name?: string } | null)?.name === "ArtVersionTakenError";

export function createInMemorySavedArtVersionRepository<T>(): SavedArtVersionRepository<T> {
  const saved = new Map<string, ArtVersion<T>[]>();
  return {
    async list(artId) {
      return [...(saved.get(artId) ?? [])].sort((a, b) => a.version - b.version);
    },
    async insert(artId, version) {
      const versions = saved.get(artId) ?? [];
      if (versions.some((v) => v.version === version.version)) throw new ArtVersionTakenError(artId, version.version);
      saved.set(artId, [...versions, version]);
    },
  };
}

export function createArtVersionStore<T>(deps: {
  codeVersions: CodeArtVersions<T>;
  /** Defaults to an in-memory repository, which forgets saved versions on restart. */
  saved?: SavedArtVersionRepository<T>;
  /** Runs before a save; throw to refuse the copy (for example a field over its length limit). */
  validate?: (artId: string, copy: T) => void;
}): ArtVersionStore<T> {
  const { codeVersions, validate } = deps;
  const saved = deps.saved ?? createInMemorySavedArtVersionRepository<T>();
  const isKnownArt = (artId: string) => Object.prototype.hasOwnProperty.call(codeVersions, artId);

  async function list(artId: string): Promise<ArtVersion<T>[]> {
    if (!isKnownArt(artId)) return [];
    const code = [...(codeVersions[artId] ?? [])];
    // A stored row can't shadow a code version with the same number.
    const stored = (await saved.list(artId)).filter((v) => !code.some((c) => c.version === v.version));
    return [...code, ...stored].sort((a, b) => a.version - b.version);
  }

  return {
    list,
    isKnownArt,
    async get(artId, version) {
      return (await list(artId)).find((v) => v.version === version) ?? null;
    },
    async save(artId, copy, note) {
      if (!isKnownArt(artId)) throw new UnknownArtError(artId);
      validate?.(artId, copy);
      for (let attempt = 0; ; attempt++) {
        const version = Math.max(0, ...(await list(artId)).map((v) => v.version)) + 1;
        const next: ArtVersion<T> = { version, copy, note };
        try {
          await saved.insert(artId, next);
          return next;
        } catch (err) {
          if (attempt >= 1 || !isTaken(err)) throw err;
        }
      }
    },
  };
}

/** Fields of `copy` longer than their limit, with both lengths. Fields without a limit, and non-string fields, are not checked. */
export function overlongFields(copy: object, limits: Readonly<Record<string, number>>): { field: string; length: number; max: number }[] {
  const problems: { field: string; length: number; max: number }[] = [];
  for (const [field, value] of Object.entries(copy)) {
    const max = limits[field];
    if (typeof value === "string" && max !== undefined && value.length > max) problems.push({ field, length: value.length, max });
  }
  return problems;
}
