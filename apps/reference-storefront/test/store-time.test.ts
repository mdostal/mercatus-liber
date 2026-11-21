import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedLocalToUtc } from "../lib/store-time";

describe("store time", () => {
  it("turns Central wall-clock times into UTC and back, across daylight saving", () => {
    expect(zonedLocalToUtc("2026-11-30T12:00", "America/Chicago")).toBe("2026-11-30T18:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-04T12:00", "America/Chicago")).toBe("2026-07-04T17:00:00.000Z");
    expect(utcToZonedLocal("2026-11-30T18:00:00.000Z", "America/Chicago")).toBe("2026-11-30T12:00");
    expect(zonedLocalToUtc("", "America/Chicago")).toBeNull();
    expect(() => zonedLocalToUtc("next monday", "America/Chicago")).toThrow();
    expect(utcToZonedLocal(null)).toBe("");
  });
});
