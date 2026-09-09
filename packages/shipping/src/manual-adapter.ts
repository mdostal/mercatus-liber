import type {
  GetRatesInput,
  LabelPurchaseResult,
  RateQuoteResult,
  ShippingAdapter,
  TrackingStatus,
} from "./types.js";

/**
 * Real link to Pirate Ship's real, live product -- never a placeholder --
 * shown to the operator wherever this adapter reports "not available via
 * API." See the research note below for why every method that would need to
 * call an API points here instead.
 */
export const PIRATESHIP_URL = "https://www.pirateship.com";

/**
 * ---------------------------------------------------------------------------
 * PirateShip public-API research (story shipping-01, acceptance criterion 1)
 * ---------------------------------------------------------------------------
 * Confirmed during this story's own research (not assumed from the design
 * discussion) via web search against current (2026) sources:
 *
 *   - Pirate Ship does not publish or offer any official public API for
 *     rate shopping, label purchase, or tracking. Its site and support
 *     material describe only its own web UI and CSV/e-commerce-platform
 *     order-import integrations (e.g. Shopify, WooCommerce, Etsy), never a
 *     documented REST/GraphQL API developers can register for.
 *   - The only "API" surface found is an *unofficial*, community-maintained
 *     TypeScript wrapper (github.com/taciturnaxolotl/pirateship-api)
 *     reverse-engineered against Pirate Ship's *internal, undocumented*
 *     browser endpoints. Its own README states outright: "this is an
 *     undocumented internal API" and that correctness "can't be
 *     guaranteed." Building this package's real default adapter against an
 *     unofficial, unversioned, reverse-engineered internal API -- one
 *     Pirate Ship could change or block without notice, and one this
 *     project has no support relationship with -- would be exactly the
 *     kind of dishonest-looking automation this story's design explicitly
 *     rejects: it would *look* like a real integration while actually
 *     resting on a foundation neither documented nor supported by Pirate
 *     Ship itself.
 *
 *   Conclusion: the design discussion's premise holds. This adapter is a
 *   genuine, documented **manual workflow**, not a stub or a fragile
 *   scrape-based integration pretending to be one. If Pirate Ship ever
 *   ships a real, documented, supported public API, that would justify a
 *   new `@mercatus-liber/adapter-pirateship` package built against it --
 *   this adapter should stay as the always-available manual fallback
 *   regardless (mirrors fulfillment's manual adapter staying the permanent
 *   self-fulfilled default even once real POD adapters exist).
 * ---------------------------------------------------------------------------
 *
 * getTrackingStatus's real, honest limitation (also documented in
 * types.ts's TrackingStatus/TrackingStatusState comments):
 *
 *   This package has no live tracking-events API integration at all (that's
 *   the later @mercatus-liber/adapter-shippo story's job, gated on a real
 *   SHIPPO_API_TOKEN credential -- see design-discussion.md §1c). Every
 *   carrier's own live tracking API (USPS, UPS, FedEx) requires its own
 *   registered developer account and credentials -- there is no free,
 *   credential-less, zero-infra way to fetch real tracking *events* for an
 *   arbitrary number, so this adapter never pretends to. What genuinely
 *   *is* buildable with zero infrastructure: recognizing which carrier a
 *   tracking number's format belongs to (UPS/USPS/FedEx/DHL numbers all
 *   have well-documented, stable formats) and handing back that carrier's
 *   own real, public tracking-lookup URL so an operator can check the
 *   actual live status themselves. That's what this adapter does --
 *   `status: "unknown"` and `events: []` always (this adapter never
 *   fabricates a status or a timeline), plus `detectedCarrier` and
 *   `carrierTrackingUrl` when the number's format is recognized.
 */

const CARRIER_PATTERNS: { carrier: string; pattern: RegExp; urlTemplate: (n: string) => string }[] = [
  {
    carrier: "UPS",
    // UPS: "1Z" + 6-char shipper id + 2-char service + 8-digit serial (16 chars after 1Z), alphanumeric.
    pattern: /^1Z[0-9A-Z]{16}$/i,
    urlTemplate: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  },
  {
    carrier: "FedEx",
    // FedEx Express/Ground: 12 or 15 digit all-numeric tracking numbers. (FedEx SmartPost
    // numbers are 20-22 digits and genuinely overlap USPS's own 20-22 digit format -- real,
    // documented ambiguity, not a gap in this heuristic -- so that length range is attributed
    // to USPS below, the more common real-world case for a 20-22 digit number.)
    pattern: /^\d{12}$|^\d{15}$/,
    urlTemplate: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
  {
    carrier: "USPS",
    // USPS: 20-22 digit numeric (Priority/domestic), or the two-letter/two-letter international format (e.g. EA123456789US).
    pattern: /^\d{20,22}$|^[A-Z]{2}\d{9}US$/i,
    urlTemplate: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  },
  {
    carrier: "DHL",
    // DHL Express: 10-digit numeric waybill.
    pattern: /^\d{10}$/,
    urlTemplate: (n) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
  },
];

/**
 * Best-effort, format-only carrier detection -- not authoritative (a few
 * carriers' formats overlap, e.g. a 10-digit number could in principle
 * belong to more than one carrier), documented honestly above. Exported so
 * tests (and callers who want the detection alone) can exercise it
 * directly.
 */
export function detectCarrierFromTrackingNumber(
  trackingNumber: string,
): { carrier: string; url: string } | null {
  const trimmed = trackingNumber.trim();
  for (const { carrier, pattern, urlTemplate } of CARRIER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { carrier, url: urlTemplate(trimmed) };
    }
  }
  return null;
}

const NOT_AVAILABLE_REASON =
  "Pirate Ship has no public API for rate shopping or label purchase (confirmed via research, see manual-adapter.ts) -- log in to your Pirate Ship account directly to get real rates and buy a real label.";

/**
 * Zero-infra default reference implementation (design-discussion.md §1b) --
 * a genuine, documented manual workflow, not a stub pretending to be an
 * integration. `getRates` and `buyLabel` NEVER fabricate rate/label data:
 * Pirate Ship has no public API to call (see the research note above), so
 * both honestly report `{ available: false / purchased: false, reason,
 * instructionsUrl }` pointing the operator at their real Pirate Ship
 * account, every time -- never an empty-looking success, never a thrown
 * error that gives the caller nothing to act on.
 *
 * `getTrackingStatus` is the one method that can do something genuinely
 * useful without any API: it recognizes the tracking number's carrier by
 * format and returns that carrier's real public tracking-lookup URL (see
 * detectCarrierFromTrackingNumber above) -- status always "unknown" and
 * events always `[]`, because this adapter has no live data source, but the
 * carrier link is real and actionable, not fabricated.
 */
export function createManualShippingAdapter(): ShippingAdapter {
  return {
    // `_input` unused: part of the real ShippingAdapter contract, but this adapter never calls out for a real quote (see research note above).
    async getRates(_input: GetRatesInput): Promise<RateQuoteResult> {
      return {
        available: false,
        reason: NOT_AVAILABLE_REASON,
        instructionsUrl: PIRATESHIP_URL,
      };
    },

    // `_rateId` unused: part of the real ShippingAdapter contract, unused here for the same reason.
    async buyLabel(_rateId: string): Promise<LabelPurchaseResult> {
      return {
        purchased: false,
        reason: NOT_AVAILABLE_REASON,
        instructionsUrl: PIRATESHIP_URL,
      };
    },

    async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
      const detected = detectCarrierFromTrackingNumber(trackingNumber);
      return {
        status: "unknown",
        lastUpdate: null,
        events: [],
        detectedCarrier: detected?.carrier ?? null,
        carrierTrackingUrl: detected?.url ?? null,
      };
    },
  };
}
