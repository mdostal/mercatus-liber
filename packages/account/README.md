# @mercatus-liber/account

Customer profiles and order history. Orders come through a lookup you supply, so this package does not depend on how checkout stores them.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createAccountService,
  createInMemoryCustomerProfileRepository,
} from "@mercatus-liber/account";

const account = createAccountService({
  profiles: createInMemoryCustomerProfileRepository(),
  orders,
  events: createInMemoryEventBus(),
});

const found = await account.getProfileByEmail("ada@example.com");
```

## Key exports

- `createAccountService(deps)`, `AccountService`: `createProfile`, `getProfile`, `getProfileByEmail`, `updateProfile`, `listOrders`, `listRecentActivity`.
- `createInMemoryCustomerProfileRepository()`.
- `CustomerProfileRepository`, `OrderLookup`: the interfaces to implement for your own storage and order source.
- `CustomerNotFoundError`.

The recent-activity log is kept per process, so it does not survive a restart and is not shared across instances.

See [docs/subsystems/10-customer-account.md](../../docs/subsystems/10-customer-account.md).
