import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { afterAll } from "vitest";
import { describeCustomizationRepositoryContract, type CustomizationRepositories } from "../../customization/test/repository-contract.js";
import {
  createMongoArtStyleRepository,
  createMongoFinishTierRepository,
  createMongoPaletteRepository,
  createMongoPricingRulesRepository,
  createMongoProductCustomizationRepository,
} from "../src/customization.js";
import type { DbLike } from "../src/index.js";
import { createFakeDb } from "./fake-db.js";

function reposOn(db: DbLike): () => CustomizationRepositories {
  return () => ({
    palette: createMongoPaletteRepository(db),
    finishTiers: createMongoFinishTierRepository(db),
    artStyles: createMongoArtStyleRepository(db),
    productCustomizations: createMongoProductCustomizationRepository(db),
    rules: createMongoPricingRulesRepository(db),
  });
}

// The package's fake database checks the repositories' logic, not MongoDB itself.
describeCustomizationRepositoryContract("MongoDB (fake)", async () => ({ open: reposOn(createFakeDb()) }));

// Set MONGODB_TEST_URL to also run the contract against a real server. Each test gets its own database.
const realUrl = process.env.MONGODB_TEST_URL;
if (realUrl) {
  const clients: MongoClient[] = [];
  afterAll(async () => {
    await Promise.all(
      clients.map(async (client) => {
        await client.db().dropDatabase();
        await client.close();
      }),
    );
  }, 60_000);
  describeCustomizationRepositoryContract(
    "MongoDB (real server)",
    async () => {
      const client = await MongoClient.connect(realUrl, { dbName: `customization_test_${randomUUID().replaceAll("-", "")}` });
      clients.push(client);
      return { open: reposOn(client.db() as unknown as DbLike) };
    },
    { timeout: 20_000 },
  );
}
