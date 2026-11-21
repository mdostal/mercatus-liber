/** The time zone dates are shown in (sale windows, countdowns). STORE_TIME_ZONE overrides it; default America/Chicago. */
export const STORE_TIME_ZONE = process.env.STORE_TIME_ZONE || "America/Chicago";

/** Minutes the zone is ahead of UTC at that instant (Chicago in November: -360). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * A wall-clock time in a zone ("2026-11-30T12:00", as a datetime-local input
 * gives it) as a UTC ISO instant ("2026-11-30T18:00:00.000Z" for Chicago).
 * Null for an empty value; throws for one that doesn't parse.
 */
export function zonedLocalToUtc(local: string, timeZone: string = STORE_TIME_ZONE): string | null {
  if (!local.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) throw new Error(`"${local}" isn't a date and time like 2026-11-30T12:00.`);
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  // Two passes settle the offset across a daylight-saving change.
  let instant = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  instant = guess - offsetMinutes(new Date(instant), timeZone) * 60000;
  return new Date(instant).toISOString();
}

/** The reverse, for filling a datetime-local input: "2026-11-30T12:00". Empty for null. */
export function utcToZonedLocal(iso: string | null | undefined, timeZone: string = STORE_TIME_ZONE): string {
  if (!iso) return "";
  const instant = new Date(iso);
  const local = new Date(instant.getTime() + offsetMinutes(instant, timeZone) * 60000);
  return local.toISOString().slice(0, 16);
}
