import { scaffoldStore, MANIFEST_FILENAME, parseManifest } from "@mercatus-liber/create-store";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUpdates } from "../src/apply-update.js";
import type { UpdateReport } from "../src/check-updates.js";

describe("applyUpdates", () => {
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "mercatus-liber-apply-update-"));
    await scaffoldStore({ targetDir, storeName: "my-shop", adapter: "sqlite", theme: "classic" });
  });

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true });
  });

  const report: UpdateReport = { updates: [{ packageName: "@mercatus-liber/catalog", fromVersion: "^0.1.0", toVersion: "0.2.0" }] };

  it("commits the version bump to package.json and the manifest when the test gate passes", async () => {
    const result = await applyUpdates(targetDir, report, { runTests: async () => true });

    expect(result.applied).toBe(true);
    const packageJson = JSON.parse(await readFile(path.join(targetDir, "package.json"), "utf8"));
    expect(packageJson.dependencies["@mercatus-liber/catalog"]).toBe("^0.2.0");
    const manifest = parseManifest(await readFile(path.join(targetDir, MANIFEST_FILENAME), "utf8"));
    expect(manifest.packageVersions["@mercatus-liber/catalog"]).toBe("^0.2.0");
  });

  it("rolls back to byte-identical pre-update content when the test gate fails", async () => {
    const originalPackageJson = await readFile(path.join(targetDir, "package.json"), "utf8");
    const originalManifest = await readFile(path.join(targetDir, MANIFEST_FILENAME), "utf8");

    const result = await applyUpdates(targetDir, report, { runTests: async () => false });

    expect(result.applied).toBe(false);
    expect(await readFile(path.join(targetDir, "package.json"), "utf8")).toBe(originalPackageJson);
    expect(await readFile(path.join(targetDir, MANIFEST_FILENAME), "utf8")).toBe(originalManifest);
  });

  it("calls runTests with the target directory, after the version bump has been written", async () => {
    let observedDependency: string | undefined;
    await applyUpdates(targetDir, report, {
      runTests: async (dir) => {
        const packageJson = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
        observedDependency = packageJson.dependencies["@mercatus-liber/catalog"];
        return true;
      },
    });

    expect(observedDependency).toBe("^0.2.0");
  });

  it("is a no-op when the report has no updates -- never calls runTests", async () => {
    let called = false;
    const result = await applyUpdates(targetDir, { updates: [] }, { runTests: async () => (called = true) });

    expect(result).toEqual({ applied: false, updates: [] });
    expect(called).toBe(false);
  });
});
