import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANIFEST_FILENAME, parseManifest } from "../src/manifest.js";
import { InvalidThemeError, scaffoldStore, TargetDirNotEmptyError } from "../src/scaffold.js";

describe("scaffoldStore", () => {
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "mercatus-liber-scaffold-"));
  });

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true });
  });

  it("writes package.json, services.ts, and the manifest into targetDir", async () => {
    await scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "classic", plugins: [] });

    const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
    expect(packageJson.name).toBe("my-shop");
    const servicesTs = await readFile(path.join(targetDir, "services.ts"), "utf8");
    expect(servicesTs).toContain("createSqliteAdapter");
    const manifestRaw = await readFile(path.join(targetDir, MANIFEST_FILENAME), "utf8");
    expect(parseManifest(manifestRaw).storeName).toBe("my-shop");
  });

  it("includes exactly the chosen adapter package -- never all three", async () => {
    await scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "classic" });
    const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
    expect(packageJson.dependencies["@mercatus-liber/adapter-sqlite"]).toBeDefined();
    expect(packageJson.dependencies["@mercatus-liber/adapter-postgres"]).toBeUndefined();
    expect(packageJson.dependencies["@mercatus-liber/adapter-shopify"]).toBeUndefined();
  });

  it("choosing 'shopify' wires createShopifyAdapter in both package.json and the generated services.ts", async () => {
    await scaffoldStore({ targetDir, storeName: "my-shop", adapter: "shopify", theme: "dark" });
    const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
    expect(packageJson.dependencies["@mercatus-liber/adapter-shopify"]).toBeDefined();
    expect(packageJson.dependencies["@mercatus-liber/adapter-sqlite"]).toBeUndefined();
    const servicesTs = await readFile(path.join(targetDir, "services.ts"), "utf8");
    expect(servicesTs).toContain("createShopifyAdapter");
  });

  it("choosing 'postgres' adds the pg dependency and wires createPostgresAdapter", async () => {
    await scaffoldStore({ targetDir, storeName: "my-shop", adapter: "postgres", theme: "minimal" });
    const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
    expect(packageJson.dependencies["@mercatus-liber/adapter-postgres"]).toBeDefined();
    expect(packageJson.dependencies.pg).toBeDefined();
    const servicesTs = await readFile(path.join(targetDir, "services.ts"), "utf8");
    expect(servicesTs).toContain("createPostgresAdapter");
  });

  it("the manifest round-trips storeName/adapter/theme/plugins and a generatedAt timestamp exactly", async () => {
    await scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "vibrant", plugins: ["order-notification"] });
    const manifest = parseManifest(await readFile(path.join(targetDir, MANIFEST_FILENAME), "utf8"));
    expect(manifest).toMatchObject({ storeName: "my-shop", adapter: "sqlite", theme: "vibrant", plugins: ["order-notification"] });
    expect(new Date(manifest.generatedAt).toString()).not.toBe("Invalid Date");
  });

  it("throws TargetDirNotEmptyError rather than silently clobbering an existing non-empty directory", async () => {
    await writeFile(path.join(targetDir, "existing-file.txt"), "keep me");
    await expect(scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "classic" })).rejects.toThrow(TargetDirNotEmptyError);
  });

  it("overwrite: true scaffolds into a non-empty directory anyway", async () => {
    await writeFile(path.join(targetDir, "existing-file.txt"), "keep me");
    await expect(scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "classic", overwrite: true })).resolves.not.toThrow();
  });

  it("throws InvalidThemeError for an unknown theme key, before touching the filesystem", async () => {
    await expect(scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "not-a-real-theme" })).rejects.toThrow(InvalidThemeError);
    const packageJsonExists = await readFile(path.join(targetDir, "package.json"), "utf8").catch(() => null);
    expect(packageJsonExists).toBeNull();
  });
});
