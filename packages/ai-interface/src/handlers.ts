import { needsConfirmation, pendingConfirmation } from "./confirmation.js";
import type { CommerceToolDeps, ToolResult } from "./types.js";

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Every handler is a thin delegation to its structural-interface dependency
 * -- zero duplicated business logic. If checkout has a bug, start_checkout
 * has the same bug a human clicking "buy" would hit. See
 * docs/subsystems/14-ai-mcp-interface.md.
 */
export function createCommerceToolHandlers(deps: CommerceToolDeps): Record<string, ToolHandler> {
  const { catalog, search, cart, checkout, catalogAdmin, cms, inventory, providerCatalog, lines } = deps;

  const lineTools: Record<string, ToolHandler> = lines
    ? {
        async list_lines(input) {
          const state = input.state;
          return lines.listLines(state === "upcoming" || state === "active" || state === "ended" ? { state } : {});
        },
        async get_line(input) {
          return lines.getLine(String(input.slug));
        },
        async manage_line(input) {
          if (needsConfirmation(input)) return pendingConfirmation({ action: "manage_line", ...input });
          const { confirm: _confirm, ...rest } = input;
          return lines.saveLine(rest as unknown as Parameters<NonNullable<CommerceToolDeps["lines"]>["saveLine"]>[0]);
        },
      }
    : {};

  const providerTools: Record<string, ToolHandler> = providerCatalog
    ? {
        async provider_catalog_search(input) {
          const limit = Math.min(Math.max(Number(input.limit ?? 20) || 20, 1), 100);
          return providerCatalog.search({ ...(typeof input.text === "string" ? { text: input.text } : {}), ...(typeof input.technique === "string" ? { technique: input.technique } : {}), ...(typeof input.placement === "string" ? { placement: input.placement } : {}), limit });
        },
        async provider_catalog_get_product(input) {
          return providerCatalog.getProduct(String(input.productId));
        },
        async provider_catalog_bring_over(input) {
          if (needsConfirmation(input)) return pendingConfirmation({ action: "provider_catalog_bring_over", ...input });
          const { confirm: _confirm, ...rest } = input;
          return providerCatalog.bringOver(rest as unknown as Parameters<NonNullable<CommerceToolDeps["providerCatalog"]>["bringOver"]>[0]);
        },
      }
    : {};

  return {
    ...providerTools,
    ...lineTools,
    async search_products(input) {
      const text = input.text as string | undefined;
      return search.query(text === undefined ? {} : { text });
    },

    async get_product(input) {
      const slug = input.slug as string;
      const product = await catalog.getProductBySlug(slug);
      if (!product) return null;
      const skus = await catalog.listSkusByProduct(product.id);
      return { product, skus };
    },

    async add_to_cart(input) {
      const skuId = input.skuId as string;
      const quantity = input.quantity as number;
      const cartId = (input.cartId as string | undefined) ?? (await cart.createCart()).id;
      return cart.addItem(cartId, skuId, quantity);
    },

    async get_cart(input) {
      const cartId = input.cartId as string;
      return cart.getCart(cartId);
    },

    async start_checkout(input) {
      return checkout.startCheckout(
        input as unknown as Parameters<CommerceToolDeps["checkout"]["startCheckout"]>[0],
      );
    },

    async get_order_status(input) {
      const orderId = input.orderId as string;
      return checkout.getOrder(orderId);
    },

    async create_product(input) {
      if (needsConfirmation(input)) return pendingConfirmation({ action: "create_product", ...input });
      const { confirm: _confirm, ...rest } = input;
      return catalogAdmin.createProduct(rest as Parameters<CommerceToolDeps["catalogAdmin"]["createProduct"]>[0]);
    },

    async update_product(input) {
      if (needsConfirmation(input)) return pendingConfirmation({ action: "update_product", ...input });
      const { confirm: _confirm, id, ...patch } = input;
      return catalogAdmin.updateProduct(id as string, patch);
    },

    async manage_cms_page(input) {
      if (needsConfirmation(input)) return pendingConfirmation({ action: "manage_cms_page", ...input });
      const { id, action, pageType, slug, title, sections } = input;
      if (action === "create") {
        if (pageType === undefined) throw new Error("manage_cms_page: missing required field 'pageType' for action 'create'");
        if (slug === undefined) throw new Error("manage_cms_page: missing required field 'slug' for action 'create'");
        if (title === undefined) throw new Error("manage_cms_page: missing required field 'title' for action 'create'");
        if (sections === undefined) throw new Error("manage_cms_page: missing required field 'sections' for action 'create'");
        return cms.createPage({
          pageType: pageType as string,
          slug: slug as string,
          title: title as string,
          sections: sections as { componentType: string; config: Record<string, unknown> }[],
        });
      }
      if (action === "publish") return cms.publishPage(id as string);
      const patch: Parameters<CommerceToolDeps["cms"]["updatePage"]>[1] = {};
      if (title !== undefined) patch.title = title as string;
      if (sections !== undefined) patch.sections = sections as { componentType: string; config: Record<string, unknown> }[];
      return cms.updatePage(id as string, patch);
    },

    async adjust_inventory(input) {
      if (needsConfirmation(input)) return pendingConfirmation({ action: "adjust_inventory", ...input });
      const { skuId, onHand } = input;
      await inventory.setStock(skuId as string, onHand as number);
      return inventory.getStock(skuId as string);
    },
  };
}
