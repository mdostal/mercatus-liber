import { createInMemoryProviderCatalogMappingRepository } from "../src/catalog-mapping.js";
import { describeCatalogMappingContract } from "./catalog-mapping-contract.js";

describeCatalogMappingContract("in-memory", async () => {
  const repo = createInMemoryProviderCatalogMappingRepository();
  return { open: () => repo };
});
