import type { CodeArtVersions } from "./versions.js";

/**
 * Which version of each art the store sells. Kept in code, so moving a pin is
 * a reviewed change; an editor can save new versions but cannot put them on
 * sale.
 */
export type ArtPins = Readonly<Record<string, number>>;

/** An art reference as an option value: `team-mathew@v2` names a version, plain `team-mathew` means the pinned one. */
export interface ArtRef {
  artId: string;
  /** null when the reference names no version. */
  version: number | null;
}

export function parseArtRef(value: string): ArtRef {
  const m = /^(.+)@v(\d{1,6})$/.exec(value);
  return m ? { artId: m[1]!, version: Number(m[2]) } : { artId: value, version: null };
}

export function formatArtRef(artId: string, version: number): string {
  return `${artId}@v${version}`;
}

/**
 * The version a reference prints, or null when it may not print.
 *
 * - A reference without a version prints the pinned one.
 * - With `allowUnpinned` (a sample order, an admin preview) a named version prints as named.
 * - Without it (a store product) a named version must be the pinned one, so a
 *   customer can't buy art the store hasn't put on sale by editing a value.
 */
export function resolveArtVersion(ref: ArtRef, pins: ArtPins, options: { allowUnpinned?: boolean } = {}): number | null {
  const pinned = Object.prototype.hasOwnProperty.call(pins, ref.artId) ? pins[ref.artId]! : null;
  if (ref.version === null) return pinned;
  if (options.allowUnpinned) return ref.version;
  return ref.version === pinned ? ref.version : null;
}

/** Pins that point at a version the store's code does not have. Empty when every pin is good; worth a test in the store. */
export function invalidPins<T>(pins: ArtPins, codeVersions: CodeArtVersions<T>): { artId: string; version: number }[] {
  return Object.entries(pins)
    .filter(([artId, version]) => !(codeVersions[artId] ?? []).some((v) => v.version === version))
    .map(([artId, version]) => ({ artId, version }));
}
