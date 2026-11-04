import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { DemoSlug } from "./demos";

const VOTER_COOKIE_PREFIX = "ml_voter_id";

/**
 * The app-composition-layer decision @mercatus-liber/community-goals's own
 * GoalVoteRepository doc comment calls out: this package has no concept of
 * customer identity, so something downstream has to decide what a
 * "voterKey" is. For an anonymous storefront visitor (the common case --
 * voting on a "unlock the livestream" goal shouldn't require an account),
 * a long-lived random cookie is that identity. Demo-namespaced in the
 * cookie NAME itself, same cross-demo-bleed prevention as
 * cart-cookie.ts's own cartCookieName (see its doc comment) -- two demos'
 * goal vote ledgers are genuinely separate state.
 */
function voterCookieName(demoSlug: DemoSlug): string {
  return `${VOTER_COOKIE_PREFIX}__${demoSlug}`;
}

/** Read-only -- safe to call from a Server Component render. Returns null if no voter cookie is set yet for this demo. */
export async function readVoterId(demoSlug: DemoSlug): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(voterCookieName(demoSlug))?.value ?? null;
}

/**
 * Reads the voter id, minting a new one and setting the cookie if none
 * exists yet. Next.js only allows setting cookies inside a Server Action or
 * Route Handler -- callers must be one of those, never a plain page render,
 * same constraint cart-cookie.ts's own getOrCreateCartId documents.
 *
 * ONE YEAR expiry, not a session cookie: a goal can realistically take
 * weeks to cross a vote threshold, and a visitor who votes today should
 * still read back as "already voted" (not get a fresh double-count
 * opportunity) if they return next week.
 */
export async function getOrCreateVoterId(demoSlug: DemoSlug): Promise<string> {
  const existing = await readVoterId(demoSlug);
  if (existing) return existing;

  const id = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(voterCookieName(demoSlug), id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}
