import type { ArtStyle, ArtStyleRepository, FinishTier, FinishTierRepository, PaletteColor, PaletteRepository, ProductCustomization, ProductCustomizationRepository } from "./types.js";

/** Default in-memory PaletteRepository -- Map-backed, structuredClone in/out, same shape as every other in-memory repository in this codebase. */
export function createInMemoryPaletteRepository(): PaletteRepository {
  const colors = new Map<string, PaletteColor>();
  return {
    async list(): Promise<PaletteColor[]> {
      return Array.from(colors.values()).map((c) => structuredClone(c));
    },
    async save(color: PaletteColor): Promise<void> {
      colors.set(color.id, structuredClone(color));
    },
  };
}

/** Default in-memory FinishTierRepository -- same shape as createInMemoryPaletteRepository above. */
export function createInMemoryFinishTierRepository(): FinishTierRepository {
  const tiers = new Map<string, FinishTier>();
  return {
    async list(): Promise<FinishTier[]> {
      return Array.from(tiers.values()).map((t) => structuredClone(t));
    },
    async save(tier: FinishTier): Promise<void> {
      tiers.set(tier.id, structuredClone(tier));
    },
  };
}

/** Default in-memory ArtStyleRepository -- same shape as createInMemoryPaletteRepository above. */
export function createInMemoryArtStyleRepository(): ArtStyleRepository {
  const styles = new Map<string, ArtStyle>();
  return {
    async list(): Promise<ArtStyle[]> {
      return Array.from(styles.values()).map((s) => structuredClone(s));
    },
    async save(style: ArtStyle): Promise<void> {
      styles.set(style.id, structuredClone(style));
    },
  };
}

/** Default in-memory ProductCustomizationRepository -- same shape as every other in-memory repository in this codebase. */
export function createInMemoryProductCustomizationRepository(): ProductCustomizationRepository {
  const customizations = new Map<string, ProductCustomization>();
  return {
    async get(id: string): Promise<ProductCustomization | null> {
      const found = customizations.get(id);
      return found ? structuredClone(found) : null;
    },
    async getByProductId(productId: string): Promise<ProductCustomization | null> {
      const found = Array.from(customizations.values()).find((c) => c.productId === productId);
      return found ? structuredClone(found) : null;
    },
    async list(): Promise<ProductCustomization[]> {
      return Array.from(customizations.values()).map((c) => structuredClone(c));
    },
    async save(customization: ProductCustomization): Promise<void> {
      customizations.set(customization.id, structuredClone(customization));
    },
  };
}
