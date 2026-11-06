import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // Only `convex dev` generates this file; tests supply the same exports it would.
      { find: /^\.\/_generated\/server$/, replacement: fileURLToPath(new URL("./test/generated-server.ts", import.meta.url)) },
    ],
  },
});
