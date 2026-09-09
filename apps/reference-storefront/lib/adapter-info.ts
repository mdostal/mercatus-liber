/**
 * A small, hand-maintained descriptor of which concrete adapter this running
 * instance actually chose for each swappable subsystem, mirroring
 * lib/services.ts's own env-reading logic exactly. Deliberately does NOT
 * import or call getServicesForDemo()/buildServices() -- it reports what
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

/**
 * Mirrors services.ts's own `persistence` branch exactly (see its doc
 * comment there): `DATABASE_URL` set -> Postgres; else `SQLITE_FILE_PATH`
 * set -> file-backed SQLite at that exact path; else the original
 * in-memory SQLite default, explicitly labeled "ephemeral -- data resets
 * on every restart" so an operator sees this clearly here rather than
 * discovering it the hard way after a restart (see
 * .pHive/epics/data-backup-restore-and-adapter-portability/docs/design-discussion.md
 * §1a). Before that story this row was hardcoded to always report the
 * in-memory default -- there was no env branch to report on.
 */
function persistenceInfo(): AdapterInfo {
  if (process.env.DATABASE_URL) {
    return {
      subsystem: "Persistence (catalog)",
      adapter: "Postgres",
      detail: "DATABASE_URL is set -- createPostgresAdapter() (packages/adapter-postgres)",
      status: "active",
    };
  }

  if (process.env.SQLITE_FILE_PATH) {
    return {
      subsystem: "Persistence (catalog)",
      adapter: "SQLite (file-backed)",
      detail: `SQLITE_FILE_PATH is set -- createSqliteAdapter(${JSON.stringify(process.env.SQLITE_FILE_PATH)}) (packages/adapter-sqlite), durable across restarts`,
      status: "active",
    };
  }

  return {
    subsystem: "Persistence (catalog)",
    adapter: "SQLite (in-memory)",
    detail:
      "Neither DATABASE_URL nor SQLITE_FILE_PATH is set -- createSqliteAdapter(':memory:') (packages/adapter-sqlite) -- ephemeral, data resets on every restart",
    status: "active",
  };
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

function cmsInfo(): AdapterInfo {
  if (process.env.SANITY_PROJECT_ID) {
    return {
      subsystem: "CMS",
      adapter: "Sanity",
      detail: "SANITY_PROJECT_ID is set -- createSanityAdapter() (packages/adapter-sanity)",
      status: "active",
    };
  }

  return {
    subsystem: "CMS",
    adapter: "In-memory (reference default)",
    detail:
      "SANITY_PROJECT_ID is not set -- createInMemoryCmsAdapter() (packages/cms), a deliberately valid, fully-functional default in this app's own posture, not an error state",
    status: "active",
  };
}

/**
 * Mirrors services.ts's own fulfillment-adapters branch exactly (see its doc
 * comment there, adapter-printful-02): the manual adapter
 * (@mercatus-liber/fulfillment) is always registered as the permanent
 * self-fulfillment fallback; `PRINTFUL_API_TOKEN` set and truthy
 * additionally registers the real Printful adapter under its own provider
 * key -- but registering a provider is not the same as any SKU actually
 * routing to it (every SKU still defaults to "manual" until
 * fulfillmentRouting.setProviderForSku is called), so this row reports
 * "Printful (registered)" rather than implying every order is Printful-
 * fulfilled. Unlike every other row in this file, "active" here does not
 * imply live-verified -- see docs/subsystems/22-fulfillment.md's honest
 * disclosure: no real Printful account/API token exists in this environment.
 */
function fulfillmentInfo(): AdapterInfo {
  if (process.env.PRINTFUL_API_TOKEN) {
    return {
      subsystem: "Fulfillment",
      adapter: "Manual + Printful (registered)",
      detail:
        "PRINTFUL_API_TOKEN is set -- createPrintfulFulfillmentAdapter() (packages/adapter-printful) is registered " +
        "alongside createManualFulfillmentAdapter() (packages/fulfillment); a SKU only actually routes to " +
        "Printful once fulfillmentRouting.setProviderForSku is called for it, every SKU still defaults to " +
        "\"manual\" otherwise",
      status: "active",
    };
  }

  return {
    subsystem: "Fulfillment",
    adapter: "Manual (self-fulfillment)",
    detail:
      "PRINTFUL_API_TOKEN is not set -- only createManualFulfillmentAdapter() (packages/fulfillment) is " +
      "registered, a deliberately valid, fully-functional default in this app's own posture, not an error state",
    status: "active",
  };
}

/**
 * Returns exactly five entries describing this instance's actual adapter
 * wiring, computed fresh from process.env on every call.
 */
export function getAdapterInfo(): AdapterInfo[] {
  return [
    persistenceInfo(),
    cmsInfo(),
    paymentsInfo(),
    analyticsInfo(),
    fulfillmentInfo(),
  ];
}
