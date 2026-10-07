# Logo Exploration Provenance — 20261007T171307Z

Image-backed logo exploration for Mercatus Liber, generated via Google Gemini
(`gemini-3-pro-image`, the "Nano Banana Pro" stable model) because this repo's
`openai-image` MCP server — `plugin-hive:logo-exploration`'s own primary
image-generation path — remains disconnected (`CONNECTION_CLOSED`) and this
repo's `.mcp.json` lists no `openai-image` entry at all (re-checked live
immediately before this run; see `brand-system.yaml`'s `logo_decision.reason`
for the full history of that gap across passes). This is a disclosed
provider substitution, not a silent one: Gemini instead of OpenAI's image
API, same spirit as the earlier inline-SVG fallback's own disclosure in
`brand-guide.html`.

## Model & request shape

- **Model:** `gemini-3-pro-image` (stable "Nano Banana Pro", not a preview
  model)
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent`
- **Auth:** `x-goog-api-key` header, resolved from Portunus reference
  `personalsites-487021-google_generative_ai_api_key` via
  `portunus_resolve_exec` (secret never printed or logged — injected only as
  a subprocess argv substitution)
- **generationConfig:** `{"responseModalities": ["IMAGE"]}`
- **Candidates per call:** 1 (one `generateContent` call per candidate image
  — 12 calls total, 4 per direction)
- **Generation timestamp (UTC):** 2026-10-07T17:13:07Z (directory timestamp)
  through 2026-10-07T17:18:49Z (all 12 calls completed in this window)

### Pre-flight verification (done before the full run)

Two real test calls were made against `gemini-3-pro-image:generateContent`
before committing to the full 12-candidate run:

1. A plain "abstract geometric icon mark, #4338A0 ink on white background"
   prompt — returned HTTP 200 with a genuinely clean abstract mark in the
   correct Ledger Indigo hue on the first try.
2. A follow-up prompt explicitly requesting a **transparent PNG background**
   — also HTTP 200, but the response `mimeType` was `image/jpeg` in both
   calls, and inspecting the decoded bytes (`PIL.Image.open(...).mode`)
   confirmed `RGB`, no alpha channel. The "transparent" request produced a
   literal gray/white checkerboard pattern **baked into the pixels** as
   drawn content, not real alpha transparency — the model does not expose a
   true transparent-background mode through this API path. Conclusion:
   **all candidates in this run target a clean solid white background
   instead of transparency**, per the task's own fallback clause ("or
   transparent, if the model supports it — check"). Transparent versions
   can be produced later via standard background-removal post-processing on
   the winning candidate if needed.

All 12 full-run calls also returned HTTP 200 and all 12 decoded to valid
image data (confirmed via `PIL.Image.open` round-trip after converting the
JPEG-encoded response bytes to true PNG files, since the artifact contract
names `<i>.png`).

## Brand brief excerpt used (grounding for every prompt)

From `.pHive/brand/brand-system.yaml`:

- **Project:** "Mercatus Liber ('free market', Latin) — a free, MIT-licensed,
  headless commerce framework. Not a SaaS product; no paid tier baked into
  core. Primary audience: developers evaluating whether to adopt it."
- **Personality statement:** "Mercatus Liber is real, free infrastructure —
  not a demo, not a funnel. It reads like the code it ships: direct, exact,
  and built to be taken apart."
- **Tone:** direct, precise, unembellished, confident.
- **Voice principle:** "Every visual choice should read as legible and
  un-gimmicky to someone who reads schemas and diffs for a living — that's
  the actual audience, not a generic 'developer persona.'"
- **Primary color:** Ledger Indigo, `#4338A0`.
- **concept_directions** (verbatim, 1-indexed to match `direction-<N>/`):
  1. "monospace wordmark, no icon — the name set in the accent mono face,
     doing all the work"
  2. "bracket/slash lockup using literal type-system glyphs ( / < > )
     referencing adapter interfaces"
  3. "ruled-line or ledger-row motif referencing an open market ledger"

## Direction 1 — monospace wordmark, no icon

This direction's own description ("the name set in the accent mono face,
doing all the work") is inherently a *running wordmark* across a wide
canvas — it doesn't natively reduce to a square icon. Since this task asks
for favicon/badge-scale marks for all three directions, the honest
icon-scale translation used here is a compact monogram built from blocky,
fixed-width letterform geometry (evoking JetBrains Mono's squared, even
character widths) rather than literal running text — the icon-scale
distillation of "the mono face doing the work," not a departure from it.

**Exact prompt (used for all 4 candidates in `direction-1/`):**

> Flat vector icon mark, single-color line art in exactly #4338A0 ink on a
> pure white background. A compact square-format monogram built from
> blocky, monospace-typeface-style letterforms evoking "ML" (Mercatus
> Liber) -- geometric, fixed-width character proportions like a
> code/terminal font (JetBrains Mono's squared, even-width letter
> construction), NOT a running wordmark across a wide banner -- this is the
> icon-scale distillation of a "monospace wordmark, no icon" identity
> direction, built as a self-contained symbol instead of literal running
> text. Precise straight strokes, right angles or sharp miters, no serifs,
> no gradients, no drop shadows, no 3D effects, no additional ornamentation.
> Developer-tool aesthetic: restrained, structural, exact -- like a favicon
> for a CLI tool or package registry, not a startup logo. Centered
> composition, generous padding, suitable for cropping to a 16x16 favicon
> or a square social-preview badge.

**Candidates:** `direction-1/0.png`, `1.png`, `2.png`, `3.png` — four
independent sampling runs of the same prompt (no fixed seed; Gemini is
non-deterministic across calls).

## Direction 2 — bracket/slash lockup (adapter interfaces)

**Exact prompt (used for all 4 candidates in `direction-2/`):**

> Flat vector icon mark, single-color line art in exactly #4338A0 ink on a
> pure white background. An abstract geometric symbol built from literal
> programming type-system glyphs -- angle brackets "<" and ">" (or a
> forward slash) -- arranged as a lockup that reads as interface brackets
> holding an interchangeable module between them, referencing this
> framework's adapter-swappable architecture (payments, persistence, CMS,
> and analytics are each swappable adapters behind shared typed
> interfaces). Precise geometric strokes, consistent stroke width, sharp
> square or mitered joins, no serifs, no gradients, no drop shadows, no 3D
> bevels. Reads clearly as a small icon: centered, generous padding,
> suitable for a 16x16 favicon or square social-preview badge.
> Developer-tool aesthetic -- think a well-designed programming language
> logo or CLI package icon, not a generic tech-startup swoosh.

**Candidates:** `direction-2/0.png`, `1.png`, `2.png`, `3.png`.

## Direction 3 — ruled-line / ledger-row motif

**Exact prompt (used for all 4 candidates in `direction-3/`):**

> Flat vector icon mark, single-color line art in exactly #4338A0 ink on a
> pure white background. A monogram or abstract symbol built from
> horizontal ruled lines or stacked ledger-row strokes -- evoking an open
> market ledger or accounting book's ruled rows -- combined with simple
> letterform geometry suggesting "M" and "L" (Mercatus Liber). Precise
> straight horizontal strokes of consistent weight, sharp square corners,
> no serifs, no gradients, no drop shadows, no 3D effects, no ornamentation
> beyond the implied monogram and ruled rows. Should read clearly as a
> compact icon: centered composition, generous padding, suitable for a
> 16x16 favicon or square social-preview badge. Restrained, structural,
> exact -- developer-tool aesthetic, not a decorative emblem.

**Candidates:** `direction-3/0.png`, `1.png`, `2.png`, `3.png`.

## Result summary

All 12/12 candidates generated successfully (HTTP 200, valid decoded image
data for every call). No failures or content-filter rejections encountered.
Image dimensions from the model varied between 1024×1024 and 1408×768
depending on the run; files are saved as returned (not cropped or resized)
so the human reviewer sees the model's actual output.

## What happens next (human, not this pass)

Open `contact-sheet.html` in this directory and pick a winner by writing
`selected.yaml` per the schema in
`hive/references/logo-exploration-artifacts.md` — that is explicitly a
human reviewer's decision, not something this generation pass makes.
