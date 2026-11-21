import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites start PGlite (Postgres compiled to WASM), which can take
    // well over vitest's 5 s default when the whole monorepo runs at once.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One file at a time: each PGlite instance compiles WASM, and several at
    // once alongside the rest of the monorepo starve each other.
    fileParallelism: false,
  },
});
