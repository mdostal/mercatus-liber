export * from "./types.js";
export * from "./routing-repository.js";
export * from "./manual-adapter.js";
export * from "./service.js";

// order-lookup-compat.ts is deliberately NOT re-exported here: it exists purely as
// a compile-time proof (checked by `tsc -p tsconfig.json --noEmit`, i.e. every build
// and the `typecheck` script), not part of this package's public API. Re-exporting
// it would leak its `import type { CheckoutOrdersService } from "@mercatus-liber/
// checkout-orders"` into this package's public .d.ts output, forcing every consumer
// to have that (devDependency-only) package's types resolvable too -- see
// order-lookup-compat.ts's own doc comment.
