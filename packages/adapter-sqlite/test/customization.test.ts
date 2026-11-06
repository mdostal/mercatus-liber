import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll } from "vitest";
import { describeCustomizationRepositoryContract } from "../../customization/test/repository-contract.js";
import {
  createSqliteArtStyleRepository,
  createSqliteFinishTierRepository,
  createSqlitePaletteRepository,
  createSqlitePricingRulesRepository,
  createSqliteProductCustomizationRepository,
} from "../src/customization.js";

const dir = mkdtempSync(join(tmpdir(), "customization-sqlite-"));
const open: Database.Database[] = [];
let stores = 0;

afterAll(() => {
  for (const db of open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

// A real file, reopened with a new connection, so "restart" means a restart.
describeCustomizationRepositoryContract("SQLite", async () => {
  const path = join(dir, `store-${stores++}.db`);
  return {
    open() {
      const db = new Database(path);
      open.push(db);
      return {
        palette: createSqlitePaletteRepository(db),
        finishTiers: createSqliteFinishTierRepository(db),
        artStyles: createSqliteArtStyleRepository(db),
        productCustomizations: createSqliteProductCustomizationRepository(db),
        rules: createSqlitePricingRulesRepository(db),
      };
    },
  };
});
