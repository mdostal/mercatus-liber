import type { Schedule } from "./schema.js";

/**
 * - "upcoming": active status, but its window hasn't opened yet.
 * - "active": active status and inside its window (or no window).
 * - "ended": active status, but its window has closed.
 * - "inactive": not active status (draft, archived), whatever the dates say.
 */
export type LifecycleState = "upcoming" | "active" | "ended" | "inactive";

export interface Lifecycle {
  state: LifecycleState;
  /** When it opens (or opened); null when there's no start. */
  startsAt: string | null;
  /** When it closes (or closed); null when there's no end. */
  endsAt: string | null;
  /** The next moment the state changes on its own (opening or closing), or null. Useful for countdowns and cache lifetimes. */
  nextChangeAt: string | null;
}

/** Thrown for a schedule whose dates don't parse or whose end isn't after its start. */
export class InvalidScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScheduleError";
  }
}

const time = (iso: string | null | undefined, field: string): number | null => {
  if (iso === null || iso === undefined || iso === "") return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new InvalidScheduleError(`${field} "${iso}" is not an ISO 8601 date and time.`);
  return t;
};

/** Checks a schedule's dates, returning them normalised to ISO strings (null for open ends). Throws InvalidScheduleError. */
export function normalizeSchedule(schedule: Schedule): { activeFrom: string | null; activeTo: string | null } {
  const from = time(schedule.activeFrom, "activeFrom");
  const to = time(schedule.activeTo, "activeTo");
  if (from !== null && to !== null && to <= from) throw new InvalidScheduleError("activeTo must be after activeFrom.");
  return { activeFrom: from === null ? null : new Date(from).toISOString(), activeTo: to === null ? null : new Date(to).toISOString() };
}

/**
 * Where something is in its schedule at `now`. Pass several (a product and
 * its SKU, or a line and a product in it) to combine them: the result is
 * active only while all are, its window is where their windows overlap, and
 * it's inactive if any is.
 */
export function lifecycle(entities: (Schedule & { status?: string }) | (Schedule & { status?: string })[], now: Date = new Date()): Lifecycle {
  const list = Array.isArray(entities) ? entities : [entities];
  let from: number | null = null;
  let to: number | null = null;
  let inactive = false;
  for (const e of list) {
    if (e.status !== undefined && e.status !== "active") inactive = true;
    const f = time(e.activeFrom, "activeFrom");
    const t = time(e.activeTo, "activeTo");
    if (f !== null) from = from === null ? f : Math.max(from, f);
    if (t !== null) to = to === null ? t : Math.min(to, t);
  }
  const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
  const at = now.getTime();
  const empty = from !== null && to !== null && to <= from;
  let state: LifecycleState;
  if (inactive) state = "inactive";
  // Windows that don't overlap can never open.
  else if (empty) state = "ended";
  else if (from !== null && at < from) state = "upcoming";
  else if (to !== null && at >= to) state = "ended";
  else state = "active";
  const nextChangeAt = state === "upcoming" ? iso(from) : state === "active" ? iso(to) : null;
  return { state, startsAt: iso(from), endsAt: iso(to), nextChangeAt };
}

/** True when `lifecycle(...)` is "active". */
export function isActiveNow(entities: Parameters<typeof lifecycle>[0], now: Date = new Date()): boolean {
  return lifecycle(entities, now).state === "active";
}
