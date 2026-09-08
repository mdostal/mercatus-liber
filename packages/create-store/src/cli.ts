#!/usr/bin/env node
import path from "node:path";
import { scaffoldStore } from "./scaffold.js";
import type { AdapterChoice } from "./manifest.js";

function usage(): never {
  console.error("Usage: create-mercatus-liber-store <store-name> --adapter <sqlite|postgres|shopify> --theme <key> [--plugins a,b,c] [--dir <path>]");
  process.exit(1);
}

function parseArgs(argv: string[]): { storeName: string; adapter: AdapterChoice; theme: string; plugins: string[]; dir: string } {
  const [storeName, ...rest] = argv;
  if (!storeName) usage();

  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    const value = rest[i + 1];
    if (!key || value === undefined) usage();
    flags.set(key, value);
  }

  const adapter = flags.get("adapter") as AdapterChoice | undefined;
  const theme = flags.get("theme");
  if (!adapter || !theme) usage();

  return {
    storeName,
    adapter,
    theme,
    plugins: flags.get("plugins")?.split(",").filter(Boolean) ?? [],
    dir: flags.get("dir") ?? path.resolve(process.cwd(), storeName),
  };
}

async function main(): Promise<void> {
  const { storeName, adapter, theme, plugins, dir } = parseArgs(process.argv.slice(2));
  await scaffoldStore({ targetDir: dir, storeName, adapter, theme, plugins });
  console.log(`Scaffolded "${storeName}" (adapter: ${adapter}, theme: ${theme}) into ${dir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
