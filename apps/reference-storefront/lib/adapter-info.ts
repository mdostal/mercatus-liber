/**
 * A small, hand-maintained descriptor of which concrete adapter this running
 * instance actually chose for each swappable subsystem, mirroring
 * lib/services.ts's own env-reading logic exactly. Deliberately does NOT
 * import or call getServices()/buildServices() -- it reports what
 * services.ts WOULD choose given the current environment, without
 * constructing or touching any real adapter (e.g. it never builds a real
 * Stripe client). Every entry is computed fresh from process.env on each
 * call -- no caching, no memoization -- so it always reflects the current
 * environment.
 *
 * See .pHive/epics/admin-adapter-visibility-settings/docs/design-discussion.md
 * sections 2-3 for the full reasoning, and services.ts's own header comment
 * for why this is the one module allowed to describe (though not import)
 * concrete adapter choices outside of services.ts itself.
 */

export type AdapterStatus = "active" | "unconfigured";

export interface AdapterInfo {
  subsystem: string;
  adapter: string;
  detail: string;
  status: AdapterStatus;
}

function paymentsInfo(): AdapterInfo {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      subsystem: "Payments",
      adapter: "Stripe",
      detail: "STRIPE_SECRET_KEY is not set -- createLazyStripeAdapter() will fail on first use (packages/payments)",
      status: "unconfigured",
    };
  }

  let mode: string;
  if (key.startsWith("sk_test_")) {
    mode = "a test-mode key (sk_test_ prefix)";
  } else if (key.startsWith("sk_live_")) {
    mode = "a live-mode key (sk_live_ prefix)";
  } else {
    mode = "set, but its prefix doesn't match the known sk_test_/sk_live_ conventions -- mode unknown";
  }

  return {
    subsystem: "Payments",
    adapter: "Stripe",
    detail: `STRIPE_SECRET_KEY is ${mode} -- createLazyStripeAdapter() (packages/payments)`,
    status: "active",
  };
}

function analyticsInfo(): AdapterInfo {
  if (process.env.POSTHOG_API_KEY) {
    return {
      subsystem: "Analytics",
      adapter: "PostHog",
      detail: "POSTHOG_API_KEY is set -- createPostHogAdapter() (packages/analytics)",
      status: "active",
    };
  }

  return {
    subsystem: "Analytics",
    adapter: "No-op (disabled)",
    detail:
      "POSTHOG_API_KEY is not set -- createNoopAdapter() (packages/analytics), a deliberately valid, fully-functional default in this app's own posture, not an error state",
    status: "active",
  };
}

/**
 * Returns exactly four entries describing this instance's actual adapter
 * wiring, computed fresh from process.env on every call.
 */
export function getAdapterInfo(): AdapterInfo[] {
  return [
    {
      subsystem: "Persistence (catalog)",
      adapter: "SQLite (in-memory)",
      detail: "createSqliteAdapter(':memory:') -- packages/adapter-sqlite, no external database configured, no env branch exists for this today",
      status: "active",
    },
    {
      subsystem: "CMS",
      adapter: "In-memory (reference default)",
      detail: "createInMemoryCmsAdapter() -- packages/cms, no external CMS (e.g. Sanity) configured, no env branch exists for this today",
      status: "active",
    },
    paymentsInfo(),
    analyticsInfo(),
  ];
}
