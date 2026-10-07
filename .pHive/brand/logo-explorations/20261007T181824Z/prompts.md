# Logo Exploration Provenance — Round 2 — 20261007T181824Z

Second-round image-backed logo exploration for Mercatus Liber, generated via Google
Gemini (`gemini-3-pro-image`, "Nano Banana Pro"), same model and provider
substitution as round 1 (`.pHive/brand/logo-explorations/20261007T171307Z/`) since
`openai-image` remains disconnected (re-checked live before this run: still
`CONNECTION_CLOSED`, `.mcp.json` still lists no entry for it).

## Why this round exists

Round 1 shipped 12 candidates across 3 directions (monospace wordmark, adapter
brackets, ledger rows), all single-color Ledger Indigo (`#4338A0`) on white. The
human reviewer's response: *"not certain I like any of them... maybe we need to
try with some colors so i can see something there."* Asked to clarify, they
confirmed two things explicitly:

1. Go **wide on color** — no constraint to the established Ledger Indigo palette.
   Exploring colors that might even beat Ledger Indigo as the mark's own color is
   fair game (a separate, later, human conversation decides whether that ever
   changes the sitewide accent — not this pass's call).
2. Do **both**: recolor the existing 3 directions so they're easier to evaluate
   *and* run genuinely fresh concept directions too.

This directory is the result: Part A (recolor) and Part B (fresh directions).

## Directory-naming adaptation (read this before cross-referencing round 1)

The artifact contract (`hive/references/logo-exploration-artifacts.md`) defines
`direction-<N>/` with 4 candidates each, for a single-pass exploration. This round
mixes two different kinds of output against the same 3-original-directions
numbering, so the naming is adapted as follows:

- **`direction-1-recolor/`, `direction-2-recolor/`, `direction-3-recolor/`** — Part
  A. Each holds **3** images (not 4): the same round-1 mark geometry, recolored
  into 3 new colorways. The `-recolor` suffix and the reused `1`/`2`/`3` numbers
  make clear these are the *same marks* as round 1's `direction-1/2/3`, just
  recolored — a human comparing both rounds side by side can match them up
  directly instead of guessing whether a new number means a new concept.
- **`direction-4/`, `direction-5/`, `direction-6/`** — Part B. Each holds the
  standard **4** candidates, numbered continuing on from round 1's `1`/`2`/`3` so
  there is no collision when a human has both rounds open at once.

## Model & request shape

- **Model:** `gemini-3-pro-image` (stable "Nano Banana Pro")
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent`
- **Auth:** `x-goog-api-key` header, resolved from Portunus reference
  `personalsites-487021-google_generative_ai_api_key` via `portunus_resolve_exec`
  (secret substituted directly into a `curl` header argv, never printed or
  logged — payload JSON built locally first, then POSTed via `curl`, since this
  machine's Python `urllib` hit a local `SSLCertVerificationError` that `curl`
  does not have)
- **generationConfig:** `{"responseModalities": ["IMAGE"]}` (same as round 1)
- **Part B (fresh generation):** `contents[0].parts = [{"text": <prompt>}]` —
  identical shape to round 1.
- **Part A (recolor / image-edit):** `contents[0].parts = [{"inlineData": {
  "mimeType": "image/png", "data": <base64 of the round-1 base PNG>}}, {"text":
  <recolor instruction>}]` — Gemini's documented multi-part image+text input
  format (image part first, then the text instruction). **Verified with a real
  test call before committing to all 9 recolors**: sent `direction-1/1.png`
  (base64-encoded) plus a recolor-to-`#96620B` instruction; the response came
  back HTTP 200 with the exact same "ML" monogram geometry, stroke widths, and
  composition as the input, with only the ink color changed to the requested
  amber — confirming the image-input path actually edits in place rather than
  re-imagining the mark.
- **Generation timestamp (UTC):** 2026-10-07T18:18Z (directory timestamp) through
  approximately 2026-10-07T18:30Z (all 21 calls, including the 1 pre-flight test
  call, completed in this window).

## Color choices (exact hex values + reasoning)

Per the operator's instruction to go wide on color while deliberately avoiding
generic AI-design color clichés — not the warm-cream-with-terracotta-accent
look, not a lone neon-green-on-near-black pop — these are the four colors used
across this round:

| Name | Hex | Reasoning |
|---|---|---|
| Ledger Indigo | `#4338A0` | The established baseline (unchanged from round 1 / `brand-system.yaml`), included in Part B's rotation for direct comparison against the new colors on the same new concepts. |
| **Brass Amber** | **`#96620B`** | A dark, desaturated brass/amber — closer in value (darkness) to Ledger Indigo than to a pastel gold, so it reads as ink on white rather than a decorative highlight. Deliberately not the pale cream-and-terracotta pairing common in "AI startup" palettes — this is a single, considered, fully-saturated-but-dark hue, consistent with the brand's "one accent color... restraint is a design decision" voice principle. |
| **Deep Jade Teal** | **`#0F6B5C`** | A muted, dark jade-teal, not a bright or neon aqua. Chosen for the same reason as the amber: it needs to read as a serious, restrained ink color for a developer-tool brand, not a vibrant startup accent. Paired against white (not black), so there's no neon-on-dark cliché either. |
| Carbon Ink | `#1A1A1D` | Exactly the near-black already used for body text / neutral tone in `brand-system.yaml` (not a new invention) — included per the task's explicit ask for a "stark minimal option." |

## Part A — Recolor (3 directions × 3 colorways = 9 images)

Each base candidate was picked by opening and visually reviewing all 4 original
PNGs per direction (not guessed):

- **Direction 1 base: `direction-1/1.png`.** Of the four, this is the only one
  that reads cleanly and unambiguously as "ML" at a glance — balanced M/L
  proportions, consistent stroke weight, no stray disconnected marks. Candidate
  `0.png` has a floating "i"-like dot that reads as noise; `2.png`'s right-hand
  glyph reads more like a "G" than an "L"; `3.png` is too abstract to parse as
  letterforms at all.
- **Direction 2 base: `direction-2/1.png`.** The only one of the four where the
  "`<` `[/]` `>`" interface-brackets-holding-a-module reading is actually legible.
  `0.png` is skewed/off-axis; `2.png` repeats the glyph four times in a busy
  stack that reads as visual noise rather than a single mark; `3.png` is an
  interlocked, illegible knot.
- **Direction 3 base: `direction-3/1.png`.** The most evenly composed, fully
  square candidate — reads clearly as an "ML" monogram built from ledger rows,
  filling the icon frame with good balance. `0.png` reads more like unrelated
  "TE" shapes; `2.png` is a literal open-book icon (a nice idea, but it doesn't
  read as the ML monogram the brief asked for); `3.png` is sparser and less
  centered/balanced than `1.png`.

**Recolor instruction template (image input = the base PNG above; text part
follows, one per colorway):**

> Recolor this exact logo mark. Keep the precise geometry, proportions, stroke
> widths, and composition of the mark completely unchanged -- do not redraw,
> restyle, reinterpret, or add/remove any shape. The only change is color:
> replace the current ink color with exactly `<HEX>` (`<color description>`) on
> the same pure white background. Flat single-color fill, no gradients, no
> added shading, no 3D effects, no texture. Output a clean icon-scale PNG
> matching the input's framing and padding.

Used with `<HEX>` = `#96620B` ("a dark, muted brass/amber -- not a bright or
pastel gold"), `#0F6B5C` ("a dark, muted deep jade/teal -- not a bright or neon
aqua"), and `#1A1A1D` ("a near-black carbon ink"), against each of the three
base images above.

**Candidates:** `direction-1-recolor/{0,1,2}.png` = amber, teal, carbon (in that
order); same ordering for `direction-2-recolor/` and `direction-3-recolor/`.

## Part B — Three fresh concept directions (3 directions × 4 colors = 12 images)

Grounded in real facts about this project, verified directly before writing
these prompts:

- `.pHive/brand/brand-system.yaml`'s `personality.statement` — "Mercatus Liber
  is real, free infrastructure -- not a demo, not a funnel." and its
  `voice_principles` (restraint, legibility to "someone who reads schemas and
  diffs for a living").
- `README.md`'s first paragraph: *`"Free market" (Latin). A legitimate, 100%
  free/open-source alternative to Shopify/Medusa/Saleor/etc."`* — confirms the
  literal Latin meaning used for Direction 4 and the "free" framing used for
  Direction 6.
- **Correction to the brief this round was given:** the brief asserted the
  phrase *"built from decoupled, independently-swappable subsystems"* appears
  verbatim in `README.md`'s first paragraph. Verified directly against the live
  file: that exact string is not there. What *is* there, and what Direction 5's
  prompt actually cites instead: `README.md`'s own **"Prime directive"** section
  — *"No subsystem imports another subsystem's internals. Everything talks
  through shared core types, adapter interfaces, or a typed event bus."* — plus
  `docs/ARCHITECTURE.md`'s elaboration, **"Prime directive: no tight
  coupling,"** including its concrete test: *"if deleting/replacing subsystem A
  requires changing a line of code inside subsystem B, they're too coupled."*
  The underlying architectural fact (real, independently-swappable, decoupled
  subsystems) is accurate and is what grounds Direction 5 — only the exact
  quoted wording in the brief was unverified and has been corrected here rather
  than repeated as fact.

### Direction 4 — Open market / agora

Ties to the literal "mercatus" (market) half of the name — round 1's three
directions approached "market" only obliquely through ledger/accounting
imagery, never the physical marketplace itself.

**Exact prompt (color substituted per candidate):**

> Flat vector icon mark, single-color line art in exactly `<HEX>` (`<color
> name>`) ink on a pure white background. An abstracted geometric symbol
> evoking an open-air market stall or canopy roofline -- a simple peaked or
> angled canopy shape built from 2-3 clean straight strokes (a ridge line with
> two raking support/leg lines, or a minimal tent/awning silhouette),
> referencing the literal "mercatus" (market) half of this project's name --
> the physical marketplace itself, a facet the first round's three directions
> (monospace wordmark, adapter brackets, ledger rows) approached only
> obliquely through accounting/ledger imagery, never the market stall itself.
> Precise geometric strokes, consistent stroke width, sharp angles, no
> serifs, no gradients, no drop shadows, no 3D effects, no ornamentation
> beyond the implied canopy/stall silhouette. Reads clearly as a small icon:
> centered composition, generous padding, suitable for a 16x16 favicon or
> square social-preview badge. Developer-tool aesthetic -- restrained and
> structural, not a decorative awning illustration or cutesy market-stand
> clipart.

**Candidates:** `direction-4/0.png` (Ledger Indigo), `1.png` (Brass Amber),
`2.png` (Deep Jade Teal), `3.png` (Carbon Ink).

### Direction 5 — Node graph / decoupled subsystems

Ties to the real architecture (see correction above): independent subsystems
that never import each other's internals, talking only through shared core
types, adapter interfaces, or a typed event bus. A genuinely different visual
angle than round 1's Direction 2 (literal bracket/slash type-system glyphs).

**Exact prompt (color substituted per candidate):**

> Flat vector icon mark, single-color line art in exactly `<HEX>` (`<color
> name>`) ink on a pure white background. A minimal node-graph symbol: 3 to 5
> small filled circular nodes connected by precise straight line segments,
> forming a compact, balanced network shape -- not a letterform, not a
> starburst. This references this framework's real decoupled architecture:
> independent subsystems (catalog, cart, payments, CMS, etc.) never import
> each other's internals and instead talk only through shared core types,
> adapter interfaces, or a typed event bus (README.md's own "Prime directive:
> no tight coupling" -- deleting or replacing one subsystem must never
> require touching another). The nodes should read as separate, discrete,
> swappable modules joined by thin connecting strokes -- a genuinely
> different visual angle than the first round's direction 2, which used
> literal bracket/slash type-system glyphs for the adapter-interface idea;
> this direction is the graph-of-independent-parts view instead. Consistent
> stroke width, sharp clean joins, no serifs, no gradients, no drop shadows,
> no 3D effects. Reads clearly as a small icon: centered composition,
> generous padding, suitable for a 16x16 favicon or square social-preview
> badge. Developer-tool aesthetic -- like a dependency-graph or
> architecture-diagram glyph, not a generic "network/AI" starburst or
> hub-and-spoke cliche.

**Candidates:** `direction-5/0.png` (Ledger Indigo), `1.png` (Brass Amber),
`2.png` (Deep Jade Teal), `3.png` (Carbon Ink).

### Direction 6 — Open/unlocked asymmetric form ("Liber")

Ties to the "Liber" (free) half of the name — a facet round 1's three
directions never addressed at all (they covered "market"/ledger and the
adapter-architecture metaphor, but nothing about the free/open half of the
brand's own name).

**Exact prompt (color substituted per candidate):**

> Flat vector icon mark, single-color line art in exactly `<HEX>` (`<color
> name>`) ink on a pure white background. A single asymmetric enclosure shape
> -- a ring, bracket, or partial square -- deliberately left open or
> incomplete on one side, with a visible gap breaking the form, rather than a
> fully closed shape. The open gap must read intentionally as "unlocked" or
> "free," not as a rendering error or broken shape. This references the
> "Liber" (free) half of this project's name (Mercatus Liber, "free market,"
> Latin) -- a facet the first round's three directions (monospace wordmark,
> adapter brackets, ledger rows) never addressed at all; they covered
> "market"/ledger and the adapter-architecture metaphor, but nothing about the
> free/open half of the brand's own name. Precise geometric strokes,
> consistent stroke width, sharp square or consistently-rounded terminals at
> the break, no serifs, no gradients, no drop shadows, no 3D effects, no
> padlock or key iconography (too literal and cliche for this brand's
> restrained register). Reads clearly as a small icon: centered composition,
> generous padding, suitable for a 16x16 favicon or square social-preview
> badge. Developer-tool aesthetic -- restrained and structural, not a
> decorative badge or seal.

**Candidates:** `direction-6/0.png` (Ledger Indigo), `1.png` (Brass Amber),
`2.png` (Deep Jade Teal), `3.png` (Carbon Ink).

## Result summary

**21 of 21 images succeeded** — all 9 Part A recolor calls and all 12 Part B
fresh-generation calls returned HTTP 200 with valid decoded image data
(confirmed via `PIL.Image.open` round-trip). No failures, no content-filter
rejections, no retries needed. One additional pre-flight test call (also
HTTP 200, not counted in the 21) verified the image-input recolor request shape
before the 9 production recolor calls were made. Image dimensions returned by
the model varied between 1024×1024 and 1408×768 depending on the run, same
variability as round 1; files are saved as returned (not cropped or resized).

All 9 recolors were spot-checked visually against their base images: mark
geometry is pixel-identical in composition across colorways (same strokes, same
proportions, same negative space) — the image-input edit path worked exactly as
intended, not as a reinterpretation.

## What happens next (human, not this pass)

Open `contact-sheet.html` in this directory and pick a winner (from this round,
round 1, or the inline-SVG fallback set in `brand-guide.html`) by writing
`selected.yaml` per the schema in `hive/references/logo-exploration-artifacts.md`
— a human reviewer's decision, not something this generation pass makes.
