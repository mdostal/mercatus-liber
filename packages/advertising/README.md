# @mercatus-liber/advertising

On-site banner campaigns with weighted creatives, a schedule, and targeting by page or service area.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createAdvertisingService, createInMemoryCampaignRepository } from "@mercatus-liber/advertising";

const ads = createAdvertisingService({ repository: createInMemoryCampaignRepository() });

const active = await ads.getActiveCreativeForSlot({ pageSlug: "home" });
if (active) console.log(active.creative.headline, active.creative.linkHref);
```

`getActiveCreativeForSlot` also accepts `serviceAreaId`, `demoSlug`, `now`, and `random`; the last two make selection deterministic in tests.

## Key exports

- `createAdvertisingService(deps)`: `createCampaign`, `getCampaign`, `listCampaigns`, `updateCampaign`, `deactivateCampaign`, `getActiveCreativeForSlot`.
- `createInMemoryCampaignRepository()`.
- Types: `Campaign`, `Creative`, `CampaignTargeting`, `CampaignRepository`.

## Implementing storage

Implement `CampaignRepository` and pass it as `repository`.

See [docs/subsystems/19-advertising.md](../../docs/subsystems/19-advertising.md).
