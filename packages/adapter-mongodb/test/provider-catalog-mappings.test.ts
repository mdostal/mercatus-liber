import { describeCatalogMappingContract } from "../../fulfillment/test/catalog-mapping-contract.js";
import { createMongoProviderCatalogMappingRepository } from "../src/provider-catalog-mappings.js";
import { createFakeDb } from "./fake-db.js";

describeCatalogMappingContract("MongoDB (fake)", async () => {
  const db = createFakeDb();
  return { open: () => createMongoProviderCatalogMappingRepository(db) };
});
