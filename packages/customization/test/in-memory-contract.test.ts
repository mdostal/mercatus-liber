import { createInMemoryArtStyleRepository, createInMemoryFinishTierRepository, createInMemoryPaletteRepository, createInMemoryPricingRulesRepository, createInMemoryProductCustomizationRepository } from "../src/in-memory-repository.js";
import { describeCustomizationRepositoryContract } from "./repository-contract.js";

describeCustomizationRepositoryContract("in-memory", async () => {
  const repos = {
    palette: createInMemoryPaletteRepository(),
    finishTiers: createInMemoryFinishTierRepository(),
    artStyles: createInMemoryArtStyleRepository(),
    productCustomizations: createInMemoryProductCustomizationRepository(),
    rules: createInMemoryPricingRulesRepository(),
  };
  // An in-memory store's "restart" is just the same object: it can't survive a real one.
  return { open: () => repos };
});
