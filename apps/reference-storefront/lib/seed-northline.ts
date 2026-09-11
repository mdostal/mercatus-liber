import { randomUUID } from "node:crypto";
import type { AdvertisingService } from "@mercatus-liber/advertising";
import type { BundlesService } from "@mercatus-liber/bundles";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { PromotionsService } from "@mercatus-liber/promotions";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import type { ReviewsService } from "@mercatus-liber/reviews";
import type { StorefrontViewsService } from "@mercatus-liber/storefront-views";
import type { ServiceAreaService } from "@mercatus-liber/service-areas";

/**
 * Epic 15b's public demo: "Northline Home Tech", a fictional smart-home
 * installer -- see .pHive/epics/service-demo-theme-public/docs/brand-and-scope.md
 * for the invented identity. Deliberately a different name, city list, and
 * visual identity from All That Technology (the real client epic 15a's
 * strictly-internal seed uses instead).
 *
 * These are installation SERVICES, not stocked physical goods. **Correction,
 * found post-deployment**: the comment that used to be here claimed
 * inventory was "intentionally not seeded" and that an unset stock record
 * behaves as always-available -- that was never actually true.
 * packages/inventory/src/subscriber.ts's `catalog.sku.created` handler
 * unconditionally calls `setStock(id, 0)` the instant every SKU is created
 * (a real, deliberately-tested contract, not a bug -- see
 * packages/inventory/test/subscriber.test.ts), so every service SKU here
 * silently got a real, tracked onHand=0 record and displayed "in stock: 0" /
 * schema.org OutOfStock in production. Fixed the same way lib/seed.ts's own
 * SERVICE_DEMO_SKUS already does for service-style SKUs: an explicit
 * `setStock(sku.id, 999)` right after creation, a sentinel for "always
 * bookable," not a real physical count.
 *
 * Epic demo-store-northline-depth, story northline-depth-01: 4 real
 * categories (not 1 catch-all), real tiered SKU variants for 2 services
 * (not one flat SKU each), and a real, distinct, published CMS location
 * page for every one of the 8 DEMO_SERVICE_AREAS entries (not 1 of 8).
 *
 * Epic demo-store-northline-depth, story northline-depth-02: grew the
 * catalog roughly 4x within those same 4 categories (7 -> 31 services, 10 ->
 * 46 priced SKUs) so the public demo has real breadth to browse, filter, and
 * run practice checkouts against -- not just one example per install type.
 * Every new service follows the exact same shape as the original 7: real,
 * specific installer copy (no lorem ipsum), the same flat-vs-tiered pricing
 * conventions, an explicit `inventory.setStock(sku.id, 999)` per SKU (see
 * the correction above -- still required, still not automatic), and a
 * deliberate area-subset pattern (not every new service in every area)
 * matching the original's "premium services in fewer markets, safety/core
 * services everywhere" logic.
 *
 * "make the store feel real" pass: Northline had real catalog breadth but
 * none of the merchandising depth lib/seed.ts's print-shop demo already
 * exercises -- zero promotions, zero bundles, zero curated recommendation
 * rules, zero marketing campaigns, and zero subcategories. This pass adds
 * all 5, each using the exact same already-built, already-tested framework
 * capability print-shop's seed proves out (DEMO_SUBCATEGORIES for real
 * parent/child categories via marketingCatalog.createCategory's parentId,
 * seedInstallBundle for a real cumulative-tier Bundle, seedRecommendations
 * for real cross-sell RecommendationRules, seedAdvertising for a real
 * Campaign, seedPromotions for a real redeemable coupon code) -- adapted to
 * Northline's own real services rather than copied verbatim from seed.ts.
 * All 4 are optional trailing params on seedNorthlineDemo (bundles,
 * recommendations, advertising joining the existing promotions param),
 * guarded the same `if (dep) await seedX(...)` way seedCatalog already
 * guards its own optional deps -- a caller that doesn't pass one keeps
 * working unchanged.
 */

/** One priced SKU variant of a service (the "package" identifying attribute value). Mirrors lib/seed.ts's SERVICE_DEMO_SKUS single-variant convention (identifyingAttributeKeys: ["package"]), just applied once per tier instead of once per product -- each tier is its own catalog.generateSkus call with its own price, so a "flat" service is simply a service with exactly one tier. */
interface ServiceTier {
  package: string;
  label: string;
  priceCents: number;
}

interface DemoService {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  /** One or more priced package tiers. A single-tier service (package: "standard") behaves exactly like every service did before this story; a multi-tier service generates one SKU per tier, each at its own price. */
  tiers: ServiceTier[];
  /** Indices into DEMO_SERVICE_AREAS this service is available in -- proves the subset pattern at real scale, not every service everywhere. */
  areaIndices: number[];
  /**
   * image-cdn epic: one real, topically-matched photo per service, sourced
   * from LoremFlickr (https://loremflickr.com/<w>/<h>/<keywords>) -- a real,
   * key-less, Creative-Commons Flickr-photo service, not a lorem-ipsum
   * placeholder. Lives on the shared Product (one array, added once here),
   * not repeated per tier/SKU -- images are a Product-level concept.
   */
  images: { url: string; alt: string }[];
}

interface DemoCategory {
  slug: string;
  title: string;
  description: string;
}

const DEMO_CATEGORIES: DemoCategory[] = [
  {
    slug: "tv-home-theater",
    title: "TV & Home Theater",
    description: "Big-screen mounts and full home theater builds, wall mount to whole-room calibration.",
  },
  {
    slug: "security-cameras",
    title: "Security & Cameras",
    description: "Cameras and video doorbells that actually get monitored -- installed and configured right.",
  },
  {
    slug: "networking-fiber",
    title: "Networking & Fiber",
    description: "Wired for speed: fiber drops and clean in-home network setups.",
  },
  {
    slug: "smart-home-automation",
    title: "Smart Home & Automation",
    description: "Thermostats, locks, and the smart-home basics that make a house feel modern.",
  },
];

/**
 * "make the store feel real" pass: real subcategories under 2 of the 4
 * top-level categories -- the other 2 (Security & Cameras, Networking &
 * Fiber) are left as-is, proving a category can legitimately have zero
 * children, same as every category did before this pass. `serviceSlugs`
 * assigns each subcategory's real existing DEMO_SERVICES slugs IN ADDITION
 * TO (never instead of) that service's existing top-level parent-category
 * assignment -- the same many-to-many product<->category pattern
 * lib/seed.ts's "Embroidered Fleece Hoodie" (assigned to both "embroidery"
 * and "apparel") already proves, just applied across a parent/child pair
 * instead of two unrelated top-level categories.
 */
interface DemoSubcategory {
  slug: string;
  title: string;
  description: string;
  parentSlug: string;
  serviceSlugs: string[];
}

const DEMO_SUBCATEGORIES: DemoSubcategory[] = [
  {
    slug: "tv-mounting",
    title: "TV Mounting",
    description: "Flat-panel, outdoor, and relocated TV mounts, plus the cable concealment that finishes the job.",
    parentSlug: "tv-home-theater",
    serviceSlugs: ["tv-wall-mounting", "outdoor-tv-installation", "tv-mount-relocation", "tv-cable-concealment"],
  },
  {
    slug: "home-theater-audio",
    title: "Home Theater & Audio",
    description: "Full home theater builds, projector and screen installs, in-wall speakers, and the gear that runs them.",
    parentSlug: "tv-home-theater",
    serviceSlugs: [
      "home-theater-setup",
      "projector-screen-installation",
      "soundbar-subwoofer-installation",
      "in-wall-speaker-installation",
      "av-rack-equipment-setup",
      "universal-remote-control-programming",
    ],
  },
  {
    slug: "smart-lighting-access",
    title: "Smart Lighting & Access",
    description: "Smart switches, locks, garage door openers, and motorized shades that control who gets in and how a room lights up.",
    parentSlug: "smart-home-automation",
    serviceSlugs: ["smart-lighting-install", "smart-lock-install", "smart-garage-door-opener-install", "smart-blinds-shades-install"],
  },
  {
    slug: "whole-home-automation",
    title: "Whole-Home Automation",
    description: "Thermostats, automation hubs, multi-room audio, and smoke/CO monitoring that tie a whole house together.",
    parentSlug: "smart-home-automation",
    serviceSlugs: ["smart-thermostat-install", "smart-hub-automation-setup", "whole-home-audio-install", "smart-smoke-co-detector-install"],
  },
];

const DEMO_SERVICES: DemoService[] = [
  {
    slug: "tv-wall-mounting",
    title: "TV Wall Mounting",
    description: "Flat-panel TV mounted flush to the wall, cables concealed, any wall type.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
    images: [{ url: "https://loremflickr.com/800/600/tv-mount?lock=1", alt: "A flat-screen TV mounted flush to the wall with cables concealed" }],
  },
  {
    slug: "home-theater-setup",
    title: "Home Theater Setup",
    description: "Full home theater install: speakers, receiver, calibration, universal remote.",
    categorySlug: "tv-home-theater",
    // Second tiered example: essentials covers a standard 5.1 setup, premium
    // adds in-wall wiring, a second calibration pass, and a universal remote
    // programmed for every device in the room.
    tiers: [
      { package: "essentials", label: "Essentials", priceCents: 34900 },
      { package: "premium", label: "Premium", priceCents: 54900 },
    ],
    areaIndices: [0, 2, 5], // premium service, fewer areas
    images: [{ url: "https://loremflickr.com/800/600/home-theater?lock=1", alt: "A home theater room with a large screen and surround-sound speakers" }],
  },
  {
    slug: "security-camera-install",
    title: "Security Camera Installation",
    description: "Wired or wireless security camera installation and app setup, priced by package size.",
    categorySlug: "security-cameras",
    // Tiered by camera count. Installation labor doesn't scale linearly with
    // camera count (shared trip cost, shared network/app setup, some
    // per-camera mounting/run-cable time) so pricing reflects that curve
    // rather than a flat per-camera multiple.
    tiers: [
      { package: "1-camera", label: "1-Camera Package", priceCents: 29900 },
      { package: "4-camera", label: "4-Camera Package", priceCents: 89900 },
      { package: "8-camera", label: "8-Camera Package", priceCents: 159900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
    images: [{ url: "https://loremflickr.com/800/600/security-camera?lock=1", alt: "A wall-mounted outdoor security camera" }],
  },
  {
    slug: "video-doorbell-install",
    title: "Video Doorbell Installation",
    description: "Smart video doorbell installation, existing wiring or battery-powered.",
    categorySlug: "security-cameras",
    tiers: [{ package: "standard", label: "Standard", priceCents: 12900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
    images: [{ url: "https://loremflickr.com/800/600/door-camera?lock=1", alt: "A video doorbell camera mounted beside a front door" }],
  },
  {
    slug: "fiber-internet-install",
    title: "Fiber Internet Installation",
    description: "In-home fiber internet drop, ONT mounting, and router placement.",
    categorySlug: "networking-fiber",
    tiers: [{ package: "standard", label: "Standard", priceCents: 19900 }],
    areaIndices: [0, 1, 2, 3, 4], // only areas with fiber infrastructure
    images: [{ url: "https://loremflickr.com/800/600/fiber-optic?lock=1", alt: "Fiber optic cabling run for a home internet installation" }],
  },
  {
    slug: "smart-thermostat-install",
    title: "Smart Thermostat Installation",
    description: "Smart thermostat install and app/HVAC pairing, compatible with most systems.",
    categorySlug: "smart-home-automation",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    // Not yet offered in Harborview, ME (index 7) -- Northline's newest,
    // smallest market there is still ramping up past its original 3 core
    // installs (see the Harborview location page blurb).
    areaIndices: [0, 1, 2, 3, 4, 5, 6],
    images: [{ url: "https://loremflickr.com/800/600/thermostat?lock=1", alt: "A smart thermostat mounted on an interior wall" }],
  },
  {
    slug: "smart-lock-install",
    title: "Smart Lock Installation",
    description: "Smart deadbolt or lever install with app pairing and guest-code setup.",
    categorySlug: "smart-home-automation",
    tiers: [{ package: "standard", label: "Standard", priceCents: 12900 }],
    // Not yet offered in Ashford, GA (index 4) or Harborview, ME (index 7).
    areaIndices: [0, 1, 2, 3, 5, 6],
    images: [{ url: "https://loremflickr.com/800/600/smart-lock?lock=1", alt: "A smart deadbolt lock installed on a front door" }],
  },

  // -- demo-store-northline-depth, northline-depth-02: significantly deepen
  // the catalog within the 4 existing categories (roughly 3-5x the original
  // 7-service lineup) so the demo has real breadth to browse and check out
  // against, not just one example per install type. Same DemoService shape,
  // same tiering conventions (flat single-tier vs. count/complexity-tiered),
  // same "not every service in every area" pattern as the original 7.

  // -- TV & Home Theater --
  {
    slug: "outdoor-tv-installation",
    title: "Outdoor & Patio TV Installation",
    description: "Weather-rated outdoor TV mount for a covered patio or porch, or a full weatherproof enclosure for a fully exposed install -- sealed cable entry and a grounded power run included either way.",
    categorySlug: "tv-home-theater",
    tiers: [
      { package: "covered-patio", label: "Covered Patio", priceCents: 19900 },
      { package: "full-weatherproof-enclosure", label: "Full Weatherproof Enclosure", priceCents: 34900 },
    ],
    areaIndices: [0, 2, 3, 4, 5],
    images: [{ url: "https://loremflickr.com/800/600/outdoor-tv?lock=1", alt: "A weatherproof TV mounted on an outdoor patio wall" }],
  },
  {
    slug: "projector-screen-installation",
    title: "Projector & Screen Installation",
    description: "Ceiling-mounted projector paired with a fixed-frame or motorized drop-down screen, aligned and focused for true 16:9 or 2.35:1 viewing.",
    categorySlug: "tv-home-theater",
    tiers: [
      { package: "fixed-screen", label: "Fixed Screen", priceCents: 24900 },
      { package: "motorized-premium", label: "Motorized Premium", priceCents: 44900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5],
    images: [{ url: "https://loremflickr.com/800/600/projector,screen?lock=1", alt: "A ceiling-mounted projector displaying onto a large drop-down screen" }],
  },
  {
    slug: "soundbar-subwoofer-installation",
    title: "Soundbar & Wireless Subwoofer Setup",
    description: "Soundbar mounted below or above the TV, wireless subwoofer paired and placed for even bass, and HDMI-ARC/eARC configured so the TV remote controls volume.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 9900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/soundbar?lock=1", alt: "A soundbar mounted beneath a wall-mounted television" }],
  },
  {
    slug: "in-wall-speaker-installation",
    title: "In-Wall & In-Ceiling Speaker Installation",
    description: "Flush in-wall or in-ceiling speakers cut in and wired back to an amp or receiver, dialed in for even coverage across the room -- priced by speaker count.",
    categorySlug: "tv-home-theater",
    tiers: [
      { package: "2-speaker", label: "2-Speaker", priceCents: 29900 },
      { package: "4-speaker", label: "4-Speaker", priceCents: 49900 },
      { package: "whole-home-8-speaker", label: "Whole-Home 8-Speaker", priceCents: 89900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5],
    images: [{ url: "https://loremflickr.com/800/600/ceiling-speaker?lock=1", alt: "An in-ceiling speaker installed flush with the ceiling" }],
  },
  {
    slug: "tv-cable-concealment",
    title: "TV Cable Concealment",
    description: "In-wall cable concealment kit installed behind an already-mounted TV -- power and AV cables routed inside the wall, no visible cord raceway.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 7900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/cable-management?lock=1", alt: "Neatly concealed cables routed behind a mounted television" }],
  },
  {
    slug: "av-rack-equipment-setup",
    title: "AV Rack & Equipment Closet Setup",
    description: "Equipment rack assembled and populated -- receiver, streaming boxes, network gear -- with labeled cable management and proper ventilation for a clean, serviceable setup.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 24900 }],
    areaIndices: [0, 2, 4],
    images: [{ url: "https://loremflickr.com/800/600/equipment-rack?lock=1", alt: "An AV equipment rack populated with a receiver and networking gear" }],
  },
  {
    slug: "universal-remote-control-programming",
    title: "Universal Remote & Control System Programming",
    description: "One remote (or app) programmed to control every device in the room -- TV, receiver, streaming box, lighting -- with custom activity buttons for movie night, music, and off.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 9900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/remote-control?lock=1", alt: "A universal remote control used to operate home entertainment devices" }],
  },
  {
    slug: "tv-mount-relocation",
    title: "TV Mount Relocation",
    description: "Existing wall-mounted TV safely relocated to a new wall -- old mount patched and hole-repaired, new mount installed, leveled, and cable-run to match.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 9900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/tv,bracket?lock=1", alt: "A TV mounting bracket attached to a wall stud" }],
  },

  // -- Security & Cameras --
  {
    slug: "security-system-monitoring-install",
    title: "Security System & Monitoring Installation",
    description: "Door and window sensors wired into a central panel with app and monitoring-service pairing. The advanced tier adds motion sensors and glass-break detection for full-perimeter coverage.",
    categorySlug: "security-cameras",
    tiers: [
      { package: "basic-sensors", label: "Basic Sensors", priceCents: 24900 },
      { package: "advanced-motion-glassbreak", label: "Advanced Motion & Glass-Break", priceCents: 44900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/security-alarm?lock=1", alt: "A home security alarm control panel mounted on the wall" }],
  },
  {
    slug: "floodlight-camera-install",
    title: "Floodlight Camera Installation",
    description: "Motion-activated floodlight camera wired to an existing exterior junction box, aimed and app-paired for full-coverage night lighting and recording.",
    categorySlug: "security-cameras",
    tiers: [{ package: "standard", label: "Standard", priceCents: 17900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/floodlight?lock=1", alt: "A motion-activated floodlight camera mounted under the eaves" }],
  },
  {
    slug: "smart-access-control-keypad-install",
    title: "Smart Gate & Garage Access Control Installation",
    description: "Weatherproof keypad or app-based access control wired to a gate or garage entry, with rotating guest codes and full entry-log history.",
    categorySlug: "security-cameras",
    tiers: [{ package: "standard", label: "Standard", priceCents: 19900 }],
    areaIndices: [0, 1, 2, 3, 4, 5],
    images: [{ url: "https://loremflickr.com/800/600/keypad,gate?lock=1", alt: "A weatherproof access keypad mounted beside a gate" }],
  },
  {
    slug: "nvr-dvr-setup",
    title: "NVR / DVR Setup for Existing Cameras",
    description: "Network video recorder or DVR installed and configured for an existing wired camera system -- storage sized to your camera count and retention needs.",
    categorySlug: "security-cameras",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/dvr?lock=1", alt: "A network video recorder connected to a bank of security camera feeds" }],
  },
  {
    slug: "long-range-perimeter-camera-install",
    title: "Long-Range Perimeter Camera Installation",
    description: "Long-throw camera aimed down a driveway or property line, with motion-zone tuning to cut down on false alerts from passing traffic and wildlife.",
    categorySlug: "security-cameras",
    tiers: [{ package: "standard", label: "Standard", priceCents: 24900 }],
    areaIndices: [0, 1, 2, 4],
    images: [{ url: "https://loremflickr.com/800/600/driveway,camera?lock=1", alt: "A long-range security camera aimed down a driveway" }],
  },

  // -- Networking & Fiber --
  {
    slug: "whole-home-wifi-mesh-install",
    title: "Whole-Home WiFi Mesh Installation",
    description: "Mesh WiFi nodes placed and wired (or wirelessly backhauled) for full-home coverage, priced by node count to match your square footage.",
    categorySlug: "networking-fiber",
    tiers: [
      { package: "2-node", label: "2-Node", priceCents: 19900 },
      { package: "4-node", label: "4-Node", priceCents: 32900 },
      { package: "6-node", label: "6-Node", priceCents: 46900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/wifi-router?lock=1", alt: "A WiFi mesh router node placed on a shelf for whole-home coverage" }],
  },
  {
    slug: "structured-ethernet-wiring-install",
    title: "Structured Ethernet Wiring Installation",
    description: "In-wall Cat6 runs pulled to a central patch panel -- reliable wired drops for TVs, offices, and access points, priced by drop count.",
    categorySlug: "networking-fiber",
    tiers: [
      { package: "4-drop", label: "4-Drop", priceCents: 39900 },
      { package: "8-drop", label: "8-Drop", priceCents: 69900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5],
    images: [{ url: "https://loremflickr.com/800/600/ethernet-cable?lock=1", alt: "Bundled Ethernet cables run to a structured wiring panel" }],
  },
  {
    slug: "network-rack-cabinet-setup",
    title: "Network Rack & Cabinet Setup",
    description: "Switch, patch panel, and router mounted in a wall or floor rack with labeled, dressed cabling for a clean, serviceable network closet.",
    categorySlug: "networking-fiber",
    tiers: [{ package: "standard", label: "Standard", priceCents: 34900 }],
    areaIndices: [0, 2, 4],
    images: [{ url: "https://loremflickr.com/800/600/server-rack?lock=1", alt: "A network switch and patch panel mounted in a wall cabinet" }],
  },
  {
    slug: "wifi-signal-site-survey-optimization",
    title: "WiFi Signal Site Survey & Optimization",
    description: "On-site signal mapping to find dead zones, followed by channel, placement, and band-steering adjustments to your existing equipment.",
    categorySlug: "networking-fiber",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/signal,wifi?lock=1", alt: "A technician surveying WiFi signal strength throughout a home" }],
  },
  {
    slug: "ethernet-over-powerline-setup",
    title: "Ethernet-Over-Powerline Setup",
    description: "Powerline adapters installed to extend wired network access through existing electrical wiring where running new cable isn't practical.",
    categorySlug: "networking-fiber",
    tiers: [{ package: "standard", label: "Standard", priceCents: 12900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/powerline?lock=1", alt: "A powerline network adapter plugged into a wall outlet" }],
  },

  // -- Smart Home & Automation --
  {
    slug: "smart-lighting-install",
    title: "Smart Lighting & Switch Installation",
    description: "In-wall smart switches or dimmers wired in to replace standard switches, grouped into rooms and scenes in your smart-home app.",
    categorySlug: "smart-home-automation",
    tiers: [
      { package: "starter-3-switch", label: "Starter 3-Switch", priceCents: 19900 },
      { package: "whole-home-10-switch", label: "Whole-Home 10-Switch", priceCents: 54900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/light-switch,dimmer?lock=1", alt: "A smart dimmer switch installed in place of a standard light switch" }],
  },
  {
    slug: "smart-hub-automation-setup",
    title: "Smart Hub & Automation Scene Setup",
    description: "Smart home hub installed and paired with your existing devices, with custom automations and scenes -- \"Good Night,\" \"Away,\" \"Movie Time\" -- programmed in.",
    categorySlug: "smart-home-automation",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/smart-speaker,hub?lock=1", alt: "A smart home hub set up on a countertop" }],
  },
  {
    slug: "smart-garage-door-opener-install",
    title: "Smart Garage Door Opener Installation",
    description: "Smart garage door opener installed or retrofitted onto your existing motor, with app control, open/close alerts, and scheduled guest access.",
    categorySlug: "smart-home-automation",
    tiers: [{ package: "standard", label: "Standard", priceCents: 17900 }],
    // Not yet offered in Harborview, ME (index 7).
    areaIndices: [0, 1, 2, 3, 4, 5, 6],
    images: [{ url: "https://loremflickr.com/800/600/garage-door?lock=1", alt: "A garage door fitted with a smart garage door opener" }],
  },
  {
    slug: "smart-blinds-shades-install",
    title: "Motorized Smart Blinds & Shades Installation",
    description: "Motorized shades mounted and paired to a smart-home app for scheduled and remote control, priced by window count.",
    categorySlug: "smart-home-automation",
    tiers: [
      { package: "up-to-4-windows", label: "Up to 4 Windows", priceCents: 29900 },
      { package: "5-to-10-windows", label: "5 to 10 Windows", priceCents: 54900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5],
    images: [{ url: "https://loremflickr.com/800/600/blinds?lock=1", alt: "Motorized window blinds installed and ready for smart-app control" }],
  },
  {
    slug: "whole-home-audio-install",
    title: "Whole-Home Multi-Room Audio Installation",
    description: "In-ceiling speakers and a multi-zone amp wired for independent, app-controlled audio in every room -- priced by zone count.",
    categorySlug: "smart-home-automation",
    tiers: [
      { package: "2-zone", label: "2-Zone", priceCents: 39900 },
      { package: "4-zone", label: "4-Zone", priceCents: 69900 },
    ],
    areaIndices: [0, 2, 4],
    images: [{ url: "https://loremflickr.com/800/600/home-audio,speaker?lock=1", alt: "In-ceiling speakers wired for whole-home, multi-room audio" }],
  },
  {
    slug: "smart-smoke-co-detector-install",
    title: "Smart Smoke & CO Detector Installation",
    description: "Smart smoke and carbon monoxide detectors installed and paired to your phone for instant alerts even when you're away -- priced by detector count.",
    categorySlug: "smart-home-automation",
    tiers: [
      { package: "3-detector", label: "3-Detector", priceCents: 19900 },
      { package: "6-detector", label: "6-Detector", priceCents: 34900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7],
    images: [{ url: "https://loremflickr.com/800/600/smoke-alarm?lock=1", alt: "A smart smoke and carbon monoxide detector mounted on a ceiling" }],
  },
];

const DEMO_SERVICE_AREAS = [
  {
    slug: "cedarbrook-oh",
    name: "Cedarbrook, OH",
    region: "Midwest",
    phone: "(555) 555-0201",
    hours: "Mon-Sat 8am-7pm",
    blurb:
      "Cedarbrook is Northline's founding market in Ohio's Miami Valley, and it's where our crew is based -- expect the fastest scheduling here and our full service lineup.",
  },
  {
    slug: "maple-ridge-mn",
    name: "Maple Ridge, MN",
    region: "Midwest",
    phone: "(555) 555-0202",
    hours: "Mon-Fri 8am-6pm, Sat 9am-3pm",
    blurb: "Northline's Maple Ridge crew covers the Twin Cities exurbs, from lake cabins to new-construction subdivisions.",
  },
  {
    slug: "silver-creek-co",
    name: "Silver Creek, CO",
    region: "Mountain West",
    phone: "(555) 555-0203",
    hours: "Mon-Sat 7am-6pm",
    blurb:
      "Silver Creek sits at altitude in the Rockies foothills, and our installers are just as comfortable running cable through log-frame construction as mountain-modern new builds.",
  },
  {
    slug: "brightwater-wa",
    name: "Brightwater, WA",
    region: "Pacific Northwest",
    phone: "(555) 555-0204",
    hours: "Mon-Fri 8am-7pm, Sat 9am-5pm",
    blurb: "Brightwater's damp Pacific Northwest climate means we pay extra attention to weatherproofing every outdoor camera and doorbell mount.",
  },
  {
    slug: "ashford-ga",
    name: "Ashford, GA",
    region: "Southeast",
    phone: "(555) 555-0205",
    hours: "Mon-Sat 8am-8pm",
    blurb: "Ashford is Northline's busiest Southeast market, serving the metro Atlanta suburbs with same-week scheduling most of the year.",
  },
  {
    slug: "millbrook-nc",
    name: "Millbrook, NC",
    region: "Southeast",
    phone: null,
    hours: "Tue-Sat 9am-6pm",
    blurb:
      "Millbrook's mix of historic homes and new builds near the Research Triangle keeps our crew equally comfortable with plaster walls and modern drywall.",
  },
  {
    slug: "fox-hollow-in",
    name: "Fox Hollow, IN",
    region: "Midwest",
    phone: null,
    hours: "Mon-Fri 8am-6pm",
    blurb: "Fox Hollow is a smaller Midwest market for Northline, with a lean local crew focused on the installs homeowners ask for most.",
  },
  {
    slug: "harborview-me",
    name: "Harborview, ME",
    region: "Northeast",
    phone: null,
    hours: "Mon-Fri 8am-5pm, Sat 9am-1pm",
    blurb:
      "Harborview is Northline's newest and smallest Northeast market -- our coastal Maine crew currently focuses on the core installs homeowners request most, with more services rolling out over time.",
  },
];

/**
 * "make the store feel real" pass: Northline's one real, memorable,
 * on-brand promo code -- 15% off any cart, no minimum, no coupon-code
 * lookup required elsewhere in this file since seedAdvertising's campaign
 * copy below references this exact same constant, so the advertised
 * discount and the redeemable code can never drift out of sync.
 */
const NORTHLINE_PROMO_CODE = "NORTHLINE15";

/**
 * Seeds Northline's one real cart-scope percentage promotion (the
 * promotions-real-demo-data pattern lib/seed.ts's own seedCatalog already
 * threads an optional PromotionsService through, just never exercised by
 * this file until now) -- 15% off any cart, real code required
 * (code !== null, mirrors admin-mutation-guard.test.ts's coupon-style
 * promotions, not print-shop-02's auto-applied product-scope example),
 * `targetSkuIds: []` because a cart-scope promotion discounts the whole
 * cart rather than specific SKUs, and no minCartAmount/startsAt/endsAt/
 * usageLimit constraint -- a genuinely unconditional storewide code, not an
 * artificially gated one.
 */
async function seedPromotions(promotions: PromotionsService): Promise<void> {
  await promotions.createPromotion({
    code: NORTHLINE_PROMO_CODE,
    kind: "percentage",
    scope: "cart",
    value: 15,
    currency: "USD",
    targetSkuIds: [],
    minCartAmount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
  });
}

/**
 * Northline's own version of lib/seed.ts's seedServiceBundle (the bundle-04
 * acceptance demo's 3-tier cumulative-SKU shape) -- but reuses 3 real,
 * already-seeded single-tier Northline services as the tiers' SKUs instead
 * of creating new service-demo-only SKUs, since a natural real-world upsell
 * chain already exists in DEMO_SERVICES: mount the TV, then optionally
 * conceal the cables, then optionally add a soundbar. Each tier's skuIds is
 * the correct CUMULATIVE set (tier 2 includes tier 1's SKU, tier 3 includes
 * tier 2's), same as seedServiceBundle's own tiers. Bundle is attached to
 * the base "TV Wall Mounting" product, per createBundle's own contract that
 * a bundle's productId is the base product it's rendered from on the PDP.
 */
async function seedInstallBundle(
  bundles: BundlesService,
  productIdBySlug: Map<string, string>,
  skuIdsBySlug: Map<string, string[]>,
): Promise<void> {
  const mountProductId = productIdBySlug.get("tv-wall-mounting");
  const mountSkuId = skuIdsBySlug.get("tv-wall-mounting")?.[0];
  const concealmentSkuId = skuIdsBySlug.get("tv-cable-concealment")?.[0];
  const soundbarSkuId = skuIdsBySlug.get("soundbar-subwoofer-installation")?.[0];
  if (!mountProductId || !mountSkuId || !concealmentSkuId || !soundbarSkuId) return;

  await bundles.createBundle({
    productId: mountProductId,
    title: "TV Mount Install Packages",
    tiers: [
      { id: randomUUID(), label: "Mount Only", skuIds: [mountSkuId] },
      { id: randomUUID(), label: "+ Cable Concealment", skuIds: [mountSkuId, concealmentSkuId] },
      { id: randomUUID(), label: "+ Soundbar Setup", skuIds: [mountSkuId, concealmentSkuId, soundbarSkuId] },
    ],
  });
}

/**
 * Northline's own version of lib/seed.ts's seedRecommendations -- 2 real,
 * curated cross-sell rules (rather than print-shop's 1) between services
 * that already exist in DEMO_SERVICES, placement "both" so each satisfies
 * both the PDP and cart resolution paths (see
 * resolvePdpRecommendations/resolveCartRecommendations in
 * components/recommendation-shelf.tsx): TV Wall Mounting -> TV Cable
 * Concealment (a mount install that skips concealment is the single most
 * common upsell miss in this business) and Whole-Home WiFi Mesh
 * Installation -> Smart Hub & Automation Scene Setup (a mesh network is the
 * real prerequisite most homeowners don't realize they need before their
 * smart-home automations become reliable).
 */
async function seedRecommendations(recommendations: RecommendationsService, productIdBySlug: Map<string, string>): Promise<void> {
  const mountId = productIdBySlug.get("tv-wall-mounting");
  const concealmentId = productIdBySlug.get("tv-cable-concealment");
  const meshId = productIdBySlug.get("whole-home-wifi-mesh-install");
  const hubId = productIdBySlug.get("smart-hub-automation-setup");

  if (mountId && concealmentId) {
    await recommendations.createRule({
      sourceProductId: mountId,
      label: "Customers also add",
      placement: "both",
      targetProductIds: [concealmentId],
    });
  }
  if (meshId && hubId) {
    await recommendations.createRule({
      sourceProductId: meshId,
      label: "Frequently paired with",
      placement: "both",
      targetProductIds: [hubId],
    });
  }
}

/**
 * Northline's own version of lib/seed.ts's seedAdvertising -- one real,
 * untargeted, active Campaign with 2 creatives (proving weighted-random
 * rotation is wired the same way print-shop's does), both referencing the
 * real NORTHLINE_PROMO_CODE seeded above -- never advertising a discount
 * that isn't backed by a real, redeemable code.
 */
async function seedAdvertising(advertising: AdvertisingService): Promise<void> {
  await advertising.createCampaign({
    name: "Northline Fall Install Special",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: null, pageSlug: null },
    creatives: [
      {
        id: randomUUID(),
        headline: "Save 15% on Any Installation",
        body: `Enter code ${NORTHLINE_PROMO_CODE} at checkout to save 15% on any installation, from a single TV mount to a full smart-home overhaul.`,
        imageUrl: null,
        linkHref: "/demo/northline/category/tv-home-theater",
        weight: 1,
      },
      {
        id: randomUUID(),
        headline: "New: Whole-Home WiFi Mesh Installs",
        body: `Dead zones, gone. Book a whole-home WiFi mesh install and use code ${NORTHLINE_PROMO_CODE} for 15% off.`,
        imageUrl: null,
        linkHref: "/demo/northline/products/whole-home-wifi-mesh-install",
        weight: 1,
      },
    ],
  });
}

/**
 * One real review, seeded via the real submitReview -> (optionally)
 * moderateReview round trip -- never written straight into a repository,
 * so this exercises the exact same public-submission-then-moderation path
 * a real shopper and a real admin would.
 */
interface DemoReview {
  serviceSlug: string;
  rating: 1 | 2 | 3 | 4 | 5;
  authorName: string;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  /** "published" moderates the review immediately after submission; "pending" deliberately leaves it un-moderated so /admin/reviews has real queue work to show. */
  outcome: "published" | "pending";
}

/**
 * @mercatus-liber/reviews epic: real, varied, service-specific reviews for
 * 7 of Northline's 31 real services, spread across all 4 categories and
 * favoring the services most likely to get clicked in a demo (TV Wall
 * Mounting, Whole-Home WiFi Mesh Installation, Security System &
 * Monitoring Installation). Every review reads like real post-installation
 * homeowner feedback tied to that specific service's actual scope of
 * work -- never generic "great service" filler -- and rating is genuinely
 * mixed (3s and 4s with real, fair, service-specific criticism sit
 * alongside the 5s) so the store doesn't read as fake. 3 reviews across
 * the whole set are deliberately left "pending" (submitted, never
 * moderated) so the real /admin/reviews moderation queue -- packages/
 * reviews's real submitReview -> pending -> admin-publish -> visible-on-PDP
 * round trip -- has real, visible work to demonstrate; the other 14 are
 * moderated "published" immediately after submission, same as a real
 * admin clearing their queue.
 */
const DEMO_REVIEWS: DemoReview[] = [
  // -- TV Wall Mounting (TV & Home Theater) --
  {
    serviceSlug: "tv-wall-mounting",
    rating: 5,
    authorName: "Marcus Alvarez",
    title: "Perfectly flush over the fireplace, cables totally hidden",
    body: "Mounted our 65\" over a brick-veneer fireplace. The installer used a low-profile tilting bracket and ran an in-wall cable channel down to the cabinet below, so there's not a single visible wire. Whole job took under 90 minutes and he double-checked the level twice before packing up.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "tv-wall-mounting",
    rating: 4,
    authorName: "Priya Chandran",
    title: "Great mount, just ran over the scheduled window",
    body: "The mount itself is rock solid and the cable concealment looks factory-clean. My only knock is the crew showed up about 40 minutes after the window closed -- turned out our wall was plaster-and-lath so they needed extra time to find studs and use the right anchors, which I appreciated in hindsight, but a heads-up call would've been nice.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "tv-wall-mounting",
    rating: 5,
    authorName: "Doug Fenwick",
    title: "Booked this for my parents, they're thrilled",
    body: "Bought this as a gift for my parents' new place since I don't live nearby. Northline coordinated the whole thing over the phone with my mom, showed up on time, and mounted their TV above the console exactly where she wanted it. She sent me a photo the same afternoon.",
    verifiedPurchase: false,
    outcome: "published",
  },

  // -- Home Theater Setup (TV & Home Theater) --
  {
    serviceSlug: "home-theater-setup",
    rating: 5,
    authorName: "Jordan Blackwell",
    title: "Premium tier's second calibration pass made a real difference",
    body: "Went with the premium package for the in-wall speaker wiring, and it was worth it -- no visible runs anywhere in the room. The installer did a first calibration pass, listened critically from the couch, then adjusted crossover and levels again before he called it done. The 5.1 sound is noticeably tighter than when I tried to eyeball it myself years ago.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "home-theater-setup",
    rating: 4,
    authorName: "Marisol Vega",
    title: "Sound is excellent, remote missed one input",
    body: "Essentials package covered our 5.1 setup and receiver exactly as described, and everything sounds great. Only issue is the universal remote never got programmed for our Blu-ray player's input, so we still have to grab a second remote for that one device. Everything else works from the single remote.",
    verifiedPurchase: true,
    outcome: "pending",
  },

  // -- Security System & Monitoring Installation (Security & Cameras) --
  {
    serviceSlug: "security-system-monitoring-install",
    rating: 5,
    authorName: "Angela Petrov",
    title: "Advanced tier's glass-break sensors are impressively sensitive",
    body: "We went with the advanced motion-and-glass-break package after a break-in two houses down. The panel, door/window sensors, and glass-break detectors all paired cleanly with the monitoring service, and the installer walked us through arming/disarming and a test alert before he left. Genuinely feels like full-perimeter coverage now, not just a sensor on the front door.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "security-system-monitoring-install",
    rating: 4,
    authorName: "Tom Reyes",
    title: "Solid basic-sensors install, app pairing needed a follow-up call",
    body: "The physical install -- door and window sensors wired into the panel -- was clean and fast. The monitoring-service app pairing hiccuped on my end (wrong account email on my side, to be fair), and it took one phone call to Northline support the next day to get it sorted. Once paired, everything works exactly as advertised.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "security-system-monitoring-install",
    rating: 5,
    authorName: "Linda Cho",
    title: "Compared three companies, glad we went with Northline",
    body: "I read through a handful of reviews and got quotes from two other installers before booking. Northline's tech was the only one who actually explained where each sensor was going and why, instead of just running through a checklist. Basic-sensors package covers every entry point in our ranch-style house.",
    verifiedPurchase: false,
    outcome: "published",
  },

  // -- Whole-Home WiFi Mesh Installation (Networking & Fiber) --
  {
    serviceSlug: "whole-home-wifi-mesh-install",
    rating: 5,
    authorName: "Renata Kowalski",
    title: "6-node install finally killed our basement and garage dead zones",
    body: "Our old single router never made it past the stairs. The 6-node package put nodes in the basement office and the detached garage, wired-backhauled where he could run cable and wireless where he couldn't. Speed test in the garage now hits nearly the same numbers as standing next to the router. Worth every node.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "whole-home-wifi-mesh-install",
    rating: 3,
    authorName: "Ben Okafor",
    title: "Big improvement overall, but one back bedroom is still weak",
    body: "Coverage is way better than our old router almost everywhere in the house -- kitchen, living room, and both upstairs bedrooms are all solid now. The back bedroom over the garage is still noticeably weaker, and the installer's fix was a 5th node at extra cost rather than something included in the 4-node package. Feels like the house should've been sized for 5 nodes from the start, not upsold after the fact.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "whole-home-wifi-mesh-install",
    rating: 5,
    authorName: "Sam Wu",
    title: "2-node was plenty for our townhouse",
    body: "Upgraded from a decade-old router that could barely hold a Zoom call upstairs. The 2-node kit was correctly sized for our townhouse's square footage -- installer placed one node centrally on the main floor and one upstairs, and the WiFi app shows full bars in every room now, including the finished attic.",
    verifiedPurchase: true,
    outcome: "published",
  },

  // -- Video Doorbell Installation (Security & Cameras) --
  {
    serviceSlug: "video-doorbell-install",
    rating: 5,
    authorName: "Harold Nakashima",
    title: "Reused our existing wiring, video quality is sharp",
    body: "We already had a wired doorbell chime, and the installer confirmed the existing wiring could power the new video doorbell instead of going the battery route. Picture quality on the app is noticeably sharper than the video doorbell we had before, and motion alerts are catching real activity instead of every passing car.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "video-doorbell-install",
    rating: 5,
    authorName: "Nina Castellano",
    title: "Battery unit installed in under 30 minutes",
    body: "Went battery-powered since we don't have existing doorbell wiring. Installer had it mounted, angled, and paired to the app in under half an hour, and showed me how to adjust the motion zones so it stops alerting on the sidewalk across the street.",
    verifiedPurchase: false,
    outcome: "pending",
  },

  // -- Smart Thermostat Installation (Smart Home & Automation) --
  {
    serviceSlug: "smart-thermostat-install",
    rating: 5,
    authorName: "Kevin Marsh",
    title: "Solved our C-wire problem, old dial thermostat is finally gone",
    body: "Our 1990s dial thermostat had no C-wire, which I knew would be an issue going in. The installer used a compatibility adapter instead of trying to fish new wire through finished walls, and the smart thermostat has been rock solid since. App scheduling paired with our HVAC system without a hitch.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "smart-thermostat-install",
    rating: 4,
    authorName: "Elise Granger",
    title: "Install was fast, app took some hand-holding",
    body: "The physical swap and HVAC pairing were done in about 20 minutes. The scheduling app itself is not the most intuitive thing I've used, but the installer walked me through setting up a weekday/weekend schedule before he left, which made it click. Wish he'd left a quick-reference sheet for when I inevitably forget.",
    verifiedPurchase: true,
    outcome: "published",
  },

  // -- Smart Hub & Automation Scene Setup (Smart Home & Automation) --
  {
    serviceSlug: "smart-hub-automation-setup",
    rating: 5,
    authorName: "Owen Fitzgerald",
    title: "\"Good Night\" and \"Away\" scenes work exactly as promised",
    body: "Had a hub and a handful of smart bulbs and plugs I'd never gotten around to actually automating. The installer paired everything to the hub and built out Good Night, Away, and Movie Time scenes with the exact triggers I described. Hitting one button now locks in the whole house instead of me tapping through four different apps.",
    verifiedPurchase: true,
    outcome: "published",
  },
  {
    serviceSlug: "smart-hub-automation-setup",
    rating: 3,
    authorName: "Rachel Tam",
    title: "Hub setup is solid, but the lock automation still needs a manual trigger",
    body: "Lighting and thermostat scenes both fire reliably on schedule. The one automation that hasn't worked as expected is our smart lock -- it's supposed to auto-lock as part of the Away scene, but it only shows up as a suggestion in the app rather than actually triggering, so I still have to lock it myself. Following up with Northline to see if that's a hub setting or a lock-firmware issue.",
    verifiedPurchase: true,
    outcome: "pending",
  },
];

async function seedReviews(reviews: ReviewsService, productIdBySlug: Map<string, string>): Promise<void> {
  for (const demoReview of DEMO_REVIEWS) {
    const productId = productIdBySlug.get(demoReview.serviceSlug);
    if (!productId) continue;

    const review = await reviews.submitReview({
      productId,
      rating: demoReview.rating,
      authorName: demoReview.authorName,
      title: demoReview.title,
      body: demoReview.body,
      verifiedPurchase: demoReview.verifiedPurchase,
    });

    if (demoReview.outcome === "published") {
      await reviews.moderateReview(review.id, "published");
    }
    // "pending" outcomes are left exactly as submitReview created them --
    // real, visible, un-moderated work for /admin/reviews's queue.
  }
}

export async function seedNorthlineDemo(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  serviceAreas: ServiceAreaService,
  inventory: InventoryAdapter,
  promotions?: PromotionsService,
  bundles?: BundlesService,
  recommendations?: RecommendationsService,
  advertising?: AdvertisingService,
  reviews?: ReviewsService,
  storefrontViews?: StorefrontViewsService,
): Promise<void> {
  const categoryIdBySlug = new Map<string, string>();
  for (const category of DEMO_CATEGORIES) {
    const created = await marketingCatalog.createCategory({
      slug: category.slug,
      title: category.title,
      description: category.description,
      parentId: null,
    });
    categoryIdBySlug.set(category.slug, created.id);
  }

  const areas = await Promise.all(
    DEMO_SERVICE_AREAS.map((area) =>
      serviceAreas.createServiceArea({ slug: area.slug, name: area.name, region: area.region, description: `Local installation service for ${area.name}.`, phone: area.phone }),
    ),
  );

  const productIdBySlug = new Map<string, string>();
  // "make the store feel real" pass: tracks every service's real generated
  // SKU ids (in tier order) so seedInstallBundle below can build a real
  // cumulative-tier Bundle out of 3 already-seeded services' actual SKUs,
  // never a second, duplicate set of SKUs.
  const skuIdsBySlug = new Map<string, string[]>();
  for (const service of DEMO_SERVICES) {
    const product = await catalog.createProduct({
      slug: service.slug,
      title: service.title,
      description: service.description,
      identifyingAttributeKeys: ["package"],
      images: service.images,
    });
    productIdBySlug.set(service.slug, product.id);
    await catalog.publishProduct(product.id);

    const skuIds: string[] = [];
    for (const tier of service.tiers) {
      const skus = await catalog.generateSkus(product.id, { package: [tier.package] }, { amount: tier.priceCents, currency: "USD" });
      // Real bug found post-deployment: inventory's own catalog.sku.created
      // subscriber (packages/inventory/src/subscriber.ts) unconditionally
      // sets every new SKU's stock to a real, tracked 0 the instant it's
      // created -- there is no "untracked, always available" state for a
      // SKU that's never had setStock called after creation, contrary to
      // this file's own prior (incorrect) assumption. Matches the existing
      // convention for service-style SKUs already used in lib/seed.ts's
      // SERVICE_DEMO_SKUS (stockUnits: 999) -- a large sentinel standing in
      // for "always bookable," not a real physical stock count.
      for (const sku of skus) {
        await inventory.setStock(sku.id, 999);
        skuIds.push(sku.id);
      }
    }
    skuIdsBySlug.set(service.slug, skuIds);

    const categoryId = categoryIdBySlug.get(service.categorySlug);
    if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);

    for (const areaIndex of service.areaIndices) {
      await serviceAreas.assignProductToServiceArea(product.id, areas[areaIndex]!.id);
    }
  }

  // "make the store feel real" pass: real subcategories under 2 of the 4
  // top-level categories (see DEMO_SUBCATEGORIES's doc comment) -- each
  // subcategory's real services keep their existing top-level category
  // assignment above AND additionally get assigned here, proving the same
  // many-to-many product<->category pattern lib/seed.ts's shared-category
  // products already prove.
  for (const subcategory of DEMO_SUBCATEGORIES) {
    const parentId = categoryIdBySlug.get(subcategory.parentSlug);
    if (!parentId) continue;
    const createdSubcategory = await marketingCatalog.createCategory({
      slug: subcategory.slug,
      title: subcategory.title,
      description: subcategory.description,
      parentId,
    });
    for (const serviceSlug of subcategory.serviceSlugs) {
      const productId = productIdBySlug.get(serviceSlug);
      if (productId) await marketingCatalog.assignProductToCategory(productId, createdSubcategory.id);
    }
  }

  // Slug MUST be "home" -- app/page.tsx looks up a fixed "home" slug
  // regardless of which brand's seed is active (each seed runs against its
  // own fresh in-memory DB, so there's no collision between brands).
  const home = await cms.createPage({
    pageType: "home",
    slug: "home",
    title: "Northline Home Tech",
    sections: [
      {
        componentType: "hero-banner",
        config: {
          headline: "Northline Home Tech",
          subheadline: "Professional smart-home installation -- TVs, cameras, doorbells, fiber, and home theater, done right.",
        },
      },
      {
        componentType: "product-grid",
        config: { productIds: [...productIdBySlug.values()] },
      },
    ],
  });
  await cms.publishPage(home.id);

  // One real, published location page per service area (all 8, not 1 of 8).
  // The list of services offered is derived directly from each service's
  // real areaIndices membership -- never hand-typed -- so a page can never
  // drift out of sync with what's actually assigned to that area.
  for (let areaIndex = 0; areaIndex < DEMO_SERVICE_AREAS.length; areaIndex++) {
    const area = DEMO_SERVICE_AREAS[areaIndex]!;
    const servicesOfferedHere = DEMO_SERVICES.filter((service) => service.areaIndices.includes(areaIndex)).map((service) => service.title);

    const locationPage = await cms.createPage({
      pageType: "location",
      slug: area.slug,
      title: area.name,
      sections: [
        {
          componentType: "service-area-info",
          config: {
            hours: area.hours,
            blurb: area.blurb,
            servicesOffered: servicesOfferedHere,
          },
        },
      ],
    });
    await cms.publishPage(locationPage.id);
  }

  // "make the store feel real" pass: 4 more optional, guarded merchandising
  // passes, same `if (dep) await seedX(...)` shape lib/seed.ts's own
  // seedCatalog already uses for its own optional bundles/recommendations/
  // advertising/promotions deps -- a caller that doesn't pass one of these
  // (e.g. most test files) keeps working exactly as before.
  if (promotions) await seedPromotions(promotions);
  if (bundles) await seedInstallBundle(bundles, productIdBySlug, skuIdsBySlug);
  if (recommendations) await seedRecommendations(recommendations, productIdBySlug);
  if (advertising) await seedAdvertising(advertising);
  if (reviews) await seedReviews(reviews, productIdBySlug);
}
