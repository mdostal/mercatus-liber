import type {
  ArtStyle,
  ArtStyleRepository,
  FinishTier,
  FinishTierRepository,
  PaletteColor,
  PaletteRepository,
  PricingRules,
  PricingRulesRepository,
  ProductCustomization,
  ProductCustomizationRepository,
} from "@mercatus-liber/customization";
import type { ConvexClientLike } from "./index.js";

type Kind = "palette" | "finishTier" | "artStyle" | "productCustomization" | "pricingRules";

/** A row of `customizationRecords`. See convex-functions/customization.ts for why `value` is a JSON string. */
interface RecordDoc {
  externalId: string;
  value: string;
}

async function listRecords<T>(client: ConvexClientLike, kind: Kind): Promise<T[]> {
  const docs = (await client.query("customization:list", { kind })) as RecordDoc[];
  return docs.map((doc) => JSON.parse(doc.value) as T);
}

function parseRecord<T>(doc: unknown): T | null {
  return doc ? (JSON.parse((doc as RecordDoc).value) as T) : null;
}

async function saveRecord(client: ConvexClientLike, kind: Kind, externalId: string, value: unknown, productId?: string): Promise<void> {
  await client.mutation("customization:save", { kind, externalId, value: JSON.stringify(value), ...(productId === undefined ? {} : { productId }) });
}

export function createConvexPaletteRepository(client: ConvexClientLike): PaletteRepository {
  return {
    list: () => listRecords<PaletteColor>(client, "palette"),
    save: (color) => saveRecord(client, "palette", color.id, color),
  };
}

export function createConvexFinishTierRepository(client: ConvexClientLike): FinishTierRepository {
  return {
    async list(): Promise<FinishTier[]> {
      const tiers = await listRecords<FinishTier>(client, "finishTier");
      return tiers.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    },
    save: (tier) => saveRecord(client, "finishTier", tier.id, tier),
  };
}

export function createConvexArtStyleRepository(client: ConvexClientLike): ArtStyleRepository {
  return {
    list: () => listRecords<ArtStyle>(client, "artStyle"),
    save: (style) => saveRecord(client, "artStyle", style.id, style),
  };
}

export function createConvexProductCustomizationRepository(client: ConvexClientLike): ProductCustomizationRepository {
  const kind = "productCustomization";
  return {
    async get(id: string): Promise<ProductCustomization | null> {
      return parseRecord(await client.query("customization:get", { kind, externalId: id }));
    },
    async getByProductId(productId: string): Promise<ProductCustomization | null> {
      return parseRecord(await client.query("customization:getByProductId", { kind, productId }));
    },
    list: () => listRecords<ProductCustomization>(client, kind),
    save: (customization) => saveRecord(client, kind, customization.id, customization, customization.productId),
  };
}

export function createConvexPricingRulesRepository(client: ConvexClientLike): PricingRulesRepository {
  const kind = "pricingRules";
  return {
    async get(productId: string): Promise<PricingRules | null> {
      return parseRecord(await client.query("customization:get", { kind, externalId: productId }));
    },
    save: (productId, rules) => saveRecord(client, kind, productId, rules),
    async list(): Promise<Record<string, PricingRules>> {
      const docs = (await client.query("customization:list", { kind })) as RecordDoc[];
      return Object.fromEntries(docs.map((doc) => [doc.externalId, JSON.parse(doc.value) as PricingRules]));
    },
  };
}

export interface ConvexCustomizationRepositories {
  palette: PaletteRepository;
  finishTiers: FinishTierRepository;
  artStyles: ArtStyleRepository;
  productCustomizations: ProductCustomizationRepository;
  rules: PricingRulesRepository;
}

export function createConvexCustomizationRepositories(client: ConvexClientLike): ConvexCustomizationRepositories {
  return {
    palette: createConvexPaletteRepository(client),
    finishTiers: createConvexFinishTierRepository(client),
    artStyles: createConvexArtStyleRepository(client),
    productCustomizations: createConvexProductCustomizationRepository(client),
    rules: createConvexPricingRulesRepository(client),
  };
}
