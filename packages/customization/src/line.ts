import type { LineCustomization } from "@mercatus-liber/core";
import type { CustomizationService } from "./service.js";
import type { PricingService } from "./pricing-service.js";
import type { LineInput, PriceLine, PriceResult } from "./types.js";

export interface PricedLine {
  /** Pass to CartService.addItem as `customization`. */
  line: LineCustomization;
  /** Pass to CartService.addItem as `unitPrice.amount`. */
  unitAmount: number;
  /** The itemized breakdown, for showing a shopper how the price was reached. */
  lines: PriceLine[];
  price: PriceResult;
}

/** Validates a shopper's choices and prices them, on the one pricing path, marking the line if it needs a quote. Call on the server when adding to cart: never accept a price from the browser. */
export async function priceLine(
  deps: { customization: CustomizationService; pricing: PricingService },
  productCustomizationId: string,
  productId: string,
  input: LineInput,
): Promise<PricedLine> {
  const { line, build } = await deps.customization.resolveLine(productCustomizationId, input);
  const price = await deps.pricing.priceOf(productId, build);
  const palette = await deps.customization.listPalette();
  // resolvePrice only knows color ids, so shoppers would otherwise read "Color: dawn-radiance".
  const lines = price.lines.map((priceLine) => {
    const color = priceLine.id.startsWith("color:") ? palette.find((p) => p.id === priceLine.id.slice("color:".length)) : undefined;
    return color ? { ...priceLine, label: color.label } : priceLine;
  });
  return {
    line: price.quoteRequired ? { ...line, quoteRequired: true } : line,
    unitAmount: price.total,
    lines,
    price,
  };
}

/** Thrown when a line can't become a print job as it stands. */
export class PrintOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintOrderError";
  }
}

/** One order line in the `print-order/1` format the 3D printing tools read. */
export interface PrintOrder {
  schema: "print-order/1";
  order_id: string;
  line_id: string;
  product: string;
  finish: string;
  picks?: Record<string, string>;
  art_style?: string;
  name?: string;
  font?: string;
  lettering?: Record<string, unknown>;
  colors: Record<string, unknown>;
}

/** The format allows only letters, digits and underscores in these ids, and order ids here are UUIDs. */
function printId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Turns an order line into a `print-order/1` job. `product` is the product id in
 * the print tools' own data. `printColor` is the palette id to print in before
 * painting, required for a free-color (hand-painted) finish. Refuses a line that
 * needs a quote, or a free-picked color in a printed region, since a printer can
 * only use palette filament. The print tools make the final checks of their own.
 */
export function toPrintOrder(line: LineCustomization, target: { orderId: string; lineId: string; product: string; printColor?: string }): PrintOrder {
  if (line.quoteRequired) throw new PrintOrderError("This line needs a quote, so it can't be printed as ordered");
  const values = Object.values(line.colors);
  let colors: Record<string, unknown>;
  if (line.colorMode === "any") {
    if (!target.printColor) throw new PrintOrderError("A painted finish needs a print color");
    colors = { print_color: target.printColor, paint: line.colors };
  } else {
    if (values.some((value) => value.startsWith("#"))) throw new PrintOrderError("A printed finish can only use palette colors");
    colors = line.colorMode === "single" ? { all: values[0] } : line.colors;
  }
  return {
    schema: "print-order/1",
    order_id: printId(target.orderId),
    line_id: printId(target.lineId),
    product: target.product,
    finish: line.finish,
    ...(line.picks ? { picks: line.picks } : {}),
    ...(line.artStyle ? { art_style: line.artStyle } : {}),
    ...(line.name ? { name: line.name } : {}),
    ...(line.font ? { font: line.font } : {}),
    ...(line.lettering ? { lettering: line.lettering } : {}),
    colors,
  };
}
