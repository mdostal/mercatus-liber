/**
 * admin-auth-clerk-live: covers lib/clerk-env-check.ts, the pure guard
 * against the exact real misconfiguration (CLERK_SECRET_KEY set,
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY unset) that caused this app's disclosed
 * "/admin regression" (.pHive/planning/epic-backlog.md row 56). See that
 * module's own doc comment for the full root-cause writeup, confirmed by
 * reading @clerk/nextjs@7.9.1's own published source.
 */
import { describe, expect, it } from "vitest";
import { clerkMisconfigurationError } from "../lib/clerk-env-check.js";

describe("clerkMisconfigurationError", () => {
  it("returns null when Clerk isn't configured at all (no CLERK_SECRET_KEY)", () => {
    expect(clerkMisconfigurationError({})).toBeNull();
    expect(
      clerkMisconfigurationError({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc" }),
    ).toBeNull();
  });

  it("returns null when both real env vars are set correctly", () => {
    expect(
      clerkMisconfigurationError({
        CLERK_SECRET_KEY: "sk_test_abc",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
      }),
    ).toBeNull();
  });

  it("returns a clear, non-null message when CLERK_SECRET_KEY is set but NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing", () => {
    const message = clerkMisconfigurationError({ CLERK_SECRET_KEY: "sk_test_abc" });
    expect(message).not.toBeNull();
    expect(message).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  });

  it("calls out the specific wrong-var-name mistake when the legacy CLERK_PUBLISHABLE_KEY name is set instead", () => {
    const message = clerkMisconfigurationError({
      CLERK_SECRET_KEY: "sk_test_abc",
      CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    });
    expect(message).not.toBeNull();
    expect(message).toContain("CLERK_PUBLISHABLE_KEY is set instead");
  });

  it("does not mention the legacy var when it isn't set (avoids a misleading hint)", () => {
    const message = clerkMisconfigurationError({ CLERK_SECRET_KEY: "sk_test_abc" });
    expect(message).not.toContain("is set instead");
  });
});
