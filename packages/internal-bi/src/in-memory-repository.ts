import type { BiEvent, BiEventLogRepository } from "./types.js";

/**
 * Default in-memory BiEventLogRepository -- structured exactly like every
 * other in-memory repository in this project (structuredClone in/out so
 * callers can never mutate stored state through a returned reference). A
 * durable adapter is a later, separate concern -- matches this repo's
 * "in-memory default, real durability is an adapter's job" posture (see
 * docs/subsystems/20-internal-bi.md open question 2). Not capped: the
 * reference implementation only ever accumulates events from the moment
 * registerBiEventLogSync is wired in, for a single process's lifetime.
 */
export function createInMemoryBiEventLogRepository(): BiEventLogRepository {
  const events: BiEvent[] = [];

  return {
    async append(event: BiEvent): Promise<void> {
      events.push(structuredClone(event));
    },
    async list(): Promise<BiEvent[]> {
      return events.map((event) => structuredClone(event));
    },
  };
}
