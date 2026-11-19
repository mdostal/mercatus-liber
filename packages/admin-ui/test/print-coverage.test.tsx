import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrintCoverage } from "../src/index.js";

describe("PrintCoverage", () => {
  it("draws the print to scale on the garment and captions the coverage", () => {
    const html = renderToStaticMarkup(<PrintCoverage garment={{ width: 22, length: 30 }} print={[15, 18]} size="L" />);
    expect(html).toContain('aria-label="Size L: 22 by 30 inch garment, 15 by 18 inch print, 68% of the width"');
    // 7 px per inch: garment 154 x 210, print 105 x 126 centred, 21 below the top.
    expect(html).toContain('width="154" height="210"');
    expect(html).toContain('x="24.5" y="21" width="105" height="126"');
    expect(html).toContain("covers 68% of the width and 60% of the length");
    expect(html).not.toContain("does not fit");
  });

  it("flags a print too big for the size and keeps the overhang in view", () => {
    const html = renderToStaticMarkup(<PrintCoverage garment={{ width: 14.5, length: 15.625 }} print={[15, 18]} size="2T" />);
    expect(html).toContain("too big for this size");
    expect(html).toContain("It does not fit this size.");
    expect(html).toContain("var(--color-danger");
    // Garment 101.5 px wide, print 105: it overhangs 1.75 px a side, plus the 6 px margin.
    expect(html).toMatch(/viewBox="-7\.75 /);
  });

  it("honours a different collar gap and drawing width", () => {
    const html = renderToStaticMarkup(<PrintCoverage garment={{ width: 20, length: 28 }} print={[10, 12]} topInches={2} size="M" maxWidth={120} />);
    expect(html).toContain('y="14"');
    expect(html).toContain('width="120"');
    expect(html).toContain("drawn 2 in below the collar");
  });
});
