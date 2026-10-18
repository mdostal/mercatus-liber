import type { CheckoutOrdersService } from "@mercatus-liber/checkout-orders";
import type { OrderLookup } from "./types.js";

/**
 * Real type-compatibility proof, same discipline as
 * `@mercatus-liber/fulfillment`'s `order-lookup-compat.ts` (that file's own
 * doc comment explains why this lives in `src/`, not `test/`: this
 * package's tsconfig `include` is `["src"]` only, so `tsc -p tsconfig.json
 * --noEmit` -- the `typecheck` script, and a prerequisite of `build` -- only
 * re-checks files here, never anything under `test/` (vitest's esbuild
 * transform strips types without validating them).
 *
 * `@mercatus-liber/checkout-orders` is a devDependency only (see
 * package.json) -- this is an `import type`, erased entirely at compile time
 * under `isolatedModules`, so it adds zero runtime dependency and the
 * compiled `dist/` carries no reference to it. This package's real runtime
 * `dependencies` stay core-only.
 *
 * The body is the proof: a bare `return service;` type-checks only if
 * `CheckoutOrdersService` structurally satisfies this package's own narrow
 * `OrderLookup` (types.ts) with zero adapter/glue code. Not re-exported from
 * index.ts for the same reason fulfillment's own compat file isn't -- it
 * would leak checkout-orders' types into this package's public `.d.ts`
 * output.
 */
export function assertCheckoutOrdersServiceSatisfiesOrderLookup(service: CheckoutOrdersService): OrderLookup {
  return service;
}
