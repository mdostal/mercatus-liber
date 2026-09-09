import type { CheckoutOrdersService } from "@mercatus-liber/checkout-orders";
import type { OrderLookup } from "./types.js";

/**
 * Real type-compatibility proof for acceptance criterion 4 of fulfillment-01
 * -- NOT visual inspection. This file lives in src/ (not test/) specifically
 * so `tsc -p tsconfig.json --noEmit` (this package's `typecheck` script, and
 * a prerequisite of `build`) actually re-checks it on every build: package
 * tsconfig's `include` is `["src"]` only, so a check placed under `test/`
 * would silently stop being type-checked by `tsc` (vitest's esbuild
 * transform strips types without validating them). If OrderLookup's shape
 * ever drifts from checkout-orders' real Order/CheckoutOrdersService shape,
 * this function fails to compile -- the build goes red, not just a comment
 * going stale.
 *
 * `@mercatus-liber/checkout-orders` is a devDependency only (see
 * package.json) -- this import is `import type`, erased entirely at compile
 * time under isolatedModules, so it adds zero runtime dependency and the
 * compiled dist/ carries no reference to it. This package's real runtime
 * `dependencies` stay core-only (acceptance criterion 1).
 *
 * The body itself is the proof: a bare `return service;` type-checks only if
 * CheckoutOrdersService structurally satisfies OrderLookup with zero
 * adapter/glue code -- no field renames, no wrapper object, nothing.
 */
export function assertCheckoutOrdersServiceSatisfiesOrderLookup(service: CheckoutOrdersService): OrderLookup {
  return service;
}
