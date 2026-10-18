import type { SyncableOrder } from "@mercatus-liber/accounting-sync";
import type { Money } from "@mercatus-liber/core";
import type { QuickBooksCreateSalesEntityRequest, QuickBooksLine } from "./quickbooks-types.js";

/**
 * `@mercatus-liber/accounting-sync`'s `SyncableOrder.items[].priceAtPurchase`
 * is this repo's own `Money` -- integer minor units (cents), never a float
 * (see `packages/core/src/schema.ts`'s own doc comment). QuickBooks Online's
 * real `UnitPrice`/`Amount` fields are plain decimal numbers (confirmed
 * across every source in quickbooks-types.ts's top doc comment: `100.0`,
 * not `"100.0"` and not minor units). This divides by 100 and rounds to 2
 * decimal places via the exact same `(amount / 100).toFixed(2)` conversion
 * `@mercatus-liber/adapter-shopify`'s own `skuToShopifyVariantInput`
 * (mapping.ts) already uses for the identical cents-to-decimal gap, then
 * parses back to a number (QBO's real schema wants a JSON number, not a
 * string, confirmed via every cited response/request example) -- a
 * disclosed, repo-precedented assumption that every currency this adapter
 * handles has 2 minor-unit decimal digits (true for USD and every demo
 * currency this repo actually uses; a 0-decimal currency like JPY would
 * need a different divisor, not built here since nothing in this repo uses
 * one yet).
 */
export function moneyToDecimal(money: Money): number {
  return Number((money.amount / 100).toFixed(2));
}

/** The real target a `skuId` must resolve to for QuickBooks to accept a sales-receipt/invoice line -- QBO's own `Item.Id`, a QuickBooks-assigned id this reference app's own SKU strings have no built-in relationship to (same real gap `PrintfulCatalogTarget`/`PrintifyCatalogTarget` resolve for their own providers, see adapter-printful/-printify's own mapping.ts doc comments). */
export interface QuickBooksItemTarget {
  itemId: string;
}

/** The real target an order's `customerId`/`shippingInfo` must resolve to -- QBO's own `Customer.Id` (same shape of real gap as the item target above). */
export interface QuickBooksCustomerTarget {
  customerId: string;
}

/**
 * Builds the real QBO `Line` array for a sales-receipt/invoice create
 * request -- one line per order item, `Amount` = unitPrice * quantity
 * (confirmed required as its own top-level field alongside the nested
 * `SalesItemLineDetail`, not derived server-side from `Qty`/`UnitPrice` --
 * quickbooks-types.ts's Research finding 3).
 */
export function buildQuickBooksLines(
  items: SyncableOrder["items"],
  itemTargets: Map<string, QuickBooksItemTarget>,
): QuickBooksLine[] {
  return items.map((item) => {
    const target = itemTargets.get(item.skuId);
    if (!target) {
      // Structurally unreachable given how the adapter's own syncOrder
      // populates itemTargets (one entry per input item) -- kept as a guard
      // against a future refactor silently dropping an entry, same
      // defensive-but-unreachable posture as adapter-printful's
      // toPrintfulOrderItems.
      throw new Error(`No resolved QuickBooks Item for skuId "${item.skuId}"`);
    }
    const unitPrice = moneyToDecimal(item.priceAtPurchase);
    return {
      Amount: Number((unitPrice * item.quantity).toFixed(2)),
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        ItemRef: { value: target.itemId },
        Qty: item.quantity,
        UnitPrice: unitPrice,
      },
    };
  });
}

export function buildQuickBooksCreateRequest(
  order: SyncableOrder,
  customerTarget: QuickBooksCustomerTarget,
  itemTargets: Map<string, QuickBooksItemTarget>,
): QuickBooksCreateSalesEntityRequest {
  return {
    CustomerRef: { value: customerTarget.customerId, name: order.shippingInfo.name },
    Line: buildQuickBooksLines(order.items, itemTargets),
    DocNumber: order.id,
    TxnDate: order.createdAt.slice(0, 10), // real QBO TxnDate wants YYYY-MM-DD, confirmed (quickbooks-types.ts); createdAt is a full ISO 8601 timestamp.
  };
}
