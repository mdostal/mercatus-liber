import { describe, expect, it } from "vitest";
import { InvalidScheduleError, isActiveNow, lifecycle, normalizeSchedule } from "../src/index.js";

// The first line opens Mon 2026-11-30 at noon Central (CST, UTC-6) and runs a week.
const OPEN = "2026-11-30T18:00:00.000Z";
const CLOSE = "2026-12-07T18:00:00.000Z";
const line = { status: "active", activeFrom: OPEN, activeTo: CLOSE };
const at = (iso: string) => new Date(iso);

describe("lifecycle", () => {
  it("is upcoming before the window, active inside it, ended at and after its end", () => {
    expect(lifecycle(line, at("2026-11-29T00:00:00Z"))).toEqual({ state: "upcoming", startsAt: OPEN, endsAt: CLOSE, nextChangeAt: OPEN });
    expect(lifecycle(line, at(OPEN))).toEqual({ state: "active", startsAt: OPEN, endsAt: CLOSE, nextChangeAt: CLOSE });
    expect(lifecycle(line, at(CLOSE)).state).toBe("ended");
    expect(lifecycle(line, at("2027-01-01T00:00:00Z")).nextChangeAt).toBeNull();
  });

  it("treats missing ends as open and a non-active status as inactive", () => {
    expect(lifecycle({ status: "active" }, at(OPEN))).toEqual({ state: "active", startsAt: null, endsAt: null, nextChangeAt: null });
    expect(lifecycle({ status: "active", activeFrom: OPEN }, at(CLOSE)).state).toBe("active");
    expect(lifecycle({ ...line, status: "draft" }, at(OPEN)).state).toBe("inactive");
    expect(lifecycle({ activeTo: CLOSE }, at(OPEN)).state).toBe("active");
  });

  it("combines a product, its SKU and a line to where their windows overlap", () => {
    const product = { status: "active", activeFrom: "2026-11-01T00:00:00Z" };
    const sku = { status: "active", activeTo: "2026-12-01T00:00:00Z" };
    expect(lifecycle([line, product, sku], at("2026-11-30T19:00:00Z"))).toEqual({ state: "active", startsAt: OPEN, endsAt: "2026-12-01T00:00:00.000Z", nextChangeAt: "2026-12-01T00:00:00.000Z" });
    expect(isActiveNow([line, { status: "archived" }], at("2026-12-01T00:00:00Z"))).toBe(false);
    // Windows that never overlap: never active.
    expect(lifecycle([{ activeTo: "2026-11-01T00:00:00Z" }, { activeFrom: "2026-12-01T00:00:00Z" }], at("2026-11-15T00:00:00Z")).state).toBe("ended");
  });

  it("checks and normalises dates", () => {
    expect(normalizeSchedule({ activeFrom: "2026-11-30T12:00:00-06:00", activeTo: null })).toEqual({ activeFrom: OPEN, activeTo: null });
    expect(() => normalizeSchedule({ activeFrom: CLOSE, activeTo: OPEN })).toThrow(InvalidScheduleError);
    expect(() => normalizeSchedule({ activeFrom: "next monday" })).toThrow(/not an ISO 8601/);
    expect(normalizeSchedule({ activeFrom: "", activeTo: undefined })).toEqual({ activeFrom: null, activeTo: null });
  });
});
