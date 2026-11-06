# @mercatus-liber/auto-update

Checks a scaffolded store's Mercatus Liber packages for newer versions and applies them with a test gate: if the store's tests fail after the update, it rolls back.

**Status:** built and tested, not wired into the demo stores. It reads the npm registry and no Mercatus Liber packages are published yet, so it has nothing to find today. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

From a store created by `@mercatus-liber/create-store`, which has the manifest this tool reads:

```sh
mercatus-liber-update              # report updates for the current directory
mercatus-liber-update ./my-store   # report updates for another directory
mercatus-liber-update --apply      # apply them; runs `pnpm test` and rolls back on failure
```

Or from code:

```ts
import { applyUpdates, checkForUpdates, createNpmRegistryClient } from "@mercatus-liber/auto-update";

const report = await checkForUpdates(manifest, createNpmRegistryClient());
const result = await applyUpdates("./my-store", report, {
  runTests: async () => true,
});
console.log(result.applied);
```

## Key exports

- `checkForUpdates(manifest, registry)`.
- `applyUpdates(targetDir, report, { runTests })`.
- `createNpmRegistryClient(fetchImpl?)`, `RegistryClient`: implement `RegistryClient` to read another registry.
- `PackageNotFoundError`.
- The `mercatus-liber-update` binary.

This package has no subsystem doc.
