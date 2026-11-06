# @mercatus-liber/analytics

Sends commerce events to an analytics provider and reads traffic reports back. PostHog and GA4 ship here, along with no-op adapters.

**Status:** used by the demo stores. PostHog event writing is live in production (`POSTHOG_API_KEY`, optional `POSTHOG_HOST`). The PostHog insights reader (`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, optional `POSTHOG_APP_HOST`) and GA4 reader (`GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_EMAIL`, `GA4_PRIVATE_KEY`) are credential-gated and unverified against the live providers. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createNoopAdapter, createPostHogAdapter, registerAnalyticsSync } from "@mercatus-liber/analytics";

const events = createInMemoryEventBus();

const analytics = process.env.POSTHOG_API_KEY
  ? createPostHogAdapter({ apiKey: process.env.POSTHOG_API_KEY })
  : createNoopAdapter();

registerAnalyticsSync({ events, analytics });
```

`ANALYTICS_EVENT_MAP` holds the bus-event to analytics-event name mapping, and `resolveAnalyticsEventName` looks a name up.

## Key exports

- `AnalyticsAdapter`: `track`, `identify`, `page`.
- `AnalyticsInsightsAdapter`: `getTrafficSources`, `getPageViews`, `getTopReferrers`.
- `createPostHogAdapter`, `createPostHogInsightsAdapter`, `createGa4InsightsAdapter`.
- `createNoopAdapter`, `createNoopInsightsAdapter`.
- `registerAnalyticsSync`, `ANALYTICS_EVENT_MAP`, `resolveAnalyticsEventName`.

## Implementing an adapter

Implement `AnalyticsAdapter` for writing or `AnalyticsInsightsAdapter` for reading. They are separate, so a provider can support just one.

See [docs/subsystems/13-analytics-tracking.md](../../docs/subsystems/13-analytics-tracking.md).
