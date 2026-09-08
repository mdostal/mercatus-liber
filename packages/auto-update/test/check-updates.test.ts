import type { StoreManifest } from "@mercatus-liber/create-store";
import { describe, expect, it, vi } from "vitest";
import { checkForUpdates } from "../src/check-updates.js";
import type { RegistryClient } from "../src/registry-client.js";

function buildManifest(packageVersions: Record<string, string>): StoreManifest {
  return { storeName: "my-shop", adapter: "sqlite", theme: "classic", plugins: [], packageVersions, generatedAt: new Date().toISOString() };
}

describe("checkForUpdates", () => {
  it("reports an available update when the registry's latest version is newer than the manifest's", async () => {
    const manifest = buildManifest({ "@mercatus-liber/catalog": "^0.1.0" });
    const registry: RegistryClient = { getLatestVersion: vi.fn(async () => "0.2.0") };

    const report = await checkForUpdates(manifest, registry);

    expect(report.updates).toEqual([{ packageName: "@mercatus-liber/catalog", fromVersion: "^0.1.0", toVersion: "0.2.0" }]);
  });

  it("reports no updates when every listed package already matches the registry's answer", async () => {
    const manifest = buildManifest({ "@mercatus-liber/catalog": "^0.1.0" });
    const registry: RegistryClient = { getLatestVersion: vi.fn(async () => "0.1.0") };

    const report = await checkForUpdates(manifest, registry);

    expect(report.updates).toEqual([]);
  });

  it("does not report an update for a version the registry considers older or equal", async () => {
    const manifest = buildManifest({ "@mercatus-liber/catalog": "^0.3.0" });
    const registry: RegistryClient = { getLatestVersion: vi.fn(async () => "0.2.0") };

    const report = await checkForUpdates(manifest, registry);

    expect(report.updates).toEqual([]);
  });

  it("skips non-@mercatus-liber packages (e.g. pg) entirely -- never queries the registry for them", async () => {
    const manifest = buildManifest({ "@mercatus-liber/catalog": "^0.1.0", pg: "^8.13.0" });
    const getLatestVersion = vi.fn(async (pkg: string) => (pkg === "pg" ? "9.0.0" : "0.1.0"));
    const registry: RegistryClient = { getLatestVersion };

    await checkForUpdates(manifest, registry);

    expect(getLatestVersion).toHaveBeenCalledTimes(1);
    expect(getLatestVersion).toHaveBeenCalledWith("@mercatus-liber/catalog");
  });

  it("checks every @mercatus-liber/* package independently, reporting only the ones with real updates", async () => {
    const manifest = buildManifest({ "@mercatus-liber/catalog": "^0.1.0", "@mercatus-liber/cart": "^0.1.0" });
    const registry: RegistryClient = { getLatestVersion: vi.fn(async (pkg) => (pkg === "@mercatus-liber/catalog" ? "0.2.0" : "0.1.0")) };

    const report = await checkForUpdates(manifest, registry);

    expect(report.updates.map((u) => u.packageName)).toEqual(["@mercatus-liber/catalog"]);
  });
});
