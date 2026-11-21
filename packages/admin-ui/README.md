# @mercatus-liber/admin-ui

React components for a store's admin screens. Styled with the theming package's CSS variables (`--color-surface`, `--color-text`, `--color-primary`, `--color-danger`, `--color-text-muted`); data and actions come in as props.

**Status:** started 2026-11-19 from shop.mdostal.com's back-print studio. `PrintCoverage`, `ArtVersionEditor`, `RatingsTable`, `OptionMatrixConfigurator`, and the provider catalog components below ship now. Not yet published to npm; use it from this monorepo via `workspace:*`.

## PrintCoverage

The garment laid flat with a print drawn on it to scale, captioned with how much of the width and length it covers. A print wider than the garment, or running past the hem, is drawn in the danger colour and the caption says it does not fit.

```tsx
import { PrintCoverage } from "@mercatus-liber/admin-ui";

<PrintCoverage garment={{ width: 22, length: 30 }} print={[15, 18]} size="L" />
// "Size L: garment 22 × 30 in flat. The print covers 68% of the width and 60% of the length."
```

Props: `garment` (flat width and length in inches), `print` (inches), `size` (label), `topInches` (gap below the collar, default 3), `maxWidth` (drawing width in pixels, default 260). The maths is `printCoverage` from `@mercatus-liber/print-art`.

## ArtVersionEditor

Edits print art as text fields with a live preview, saves it as a new immutable version, and lists every version: its note, which one is on the store, "Edit from this", and ordering a sample. Each field shows a character count against its limit; Save is disabled, and the too-long fields are named, while any field is over. Saving never changes what the store sells; that stays a pin in code (see `@mercatus-liber/print-art`).

```tsx
import { ArtVersionEditor } from "@mercatus-liber/admin-ui";

<ArtVersionEditor<BackCopy>
  artId="team-mathew"
  fields={[{ key: "headline1", label: "Headline", max: 30 }, { key: "close", label: "Call to action", max: 60 }]}
  base={pinnedVersion.copy}
  pin={1}
  versions={versions.map((v) => ({ ...v, previewUrl: fileUrl(v.version) }))}
  preview={(copy) => <BackPreview copy={copy} />}
  onSave={(copy, note) => saveVersionAction(copy, note)}
  onOrderSample={(version, target) => orderSampleAction(`team-mathew@v${version}`, target)}
  sampleTargets={[{ value: "tee|L|large", label: "Tee, L, large back" }]}
  pinHelp={(v) => <>Set the pin to {v} in code.</>}
/>
```

Print files are usually transparent; pass `previewBackground` (the garment colour) so light art doesn't look faded on the version cards. `onSave` and `onOrderSample` may return `{ ok: false, error }` or throw; the message is shown. Fields not listed in `fields` (a template name, a QR target) are kept from the copy as they are. Pass `copy` and `onCopyChange` to control the copy from outside, for example from a `RatingsTable`.

## RatingsTable

Candidates ranked by average score, each with its spread (standard deviation), range and number of ratings; open a row to read every rater's score and reason, highest first. `onUse` adds a "Use this" button per row. `summarizeScores(scores)` gives mean, sd, min and max for building rows.

```tsx
<RatingsTable rows={rows} caption="30 personas rated each text 1 to 10." onUse={(row) => setCopy({ ...copy, ...linesToFields(row) })} />
```

## OptionMatrixConfigurator

Pick a value for each option as chips, see images of exactly that combination, and add it to the cart, for example a sample of a garment in a design, colour, size and back print. An option's `values` can be a function of the choices made in earlier options; when a choice removes a later value, that option moves to its first available one, and an option with no values is hidden. `resolveMatrixSelection(options, wanted)` is the same rule without React.

```tsx
<OptionMatrixConfigurator
  options={[
    { key: "design", label: "Design", values: designs.map((d) => ({ id: d.id, label: d.name, badge: d.drop ? "drop" : undefined, description: d.blurb })) },
    { key: "color", label: "Color", values: (s) => colorsFor(s.design).map((c) => ({ id: c.name, label: c.name, swatch: c.hex })) },
    { key: "size", label: "Size", values: sizes.map((id) => ({ id, label: id })) },
    { key: "back", label: "Back", values: (s) => backsFor(s.color) },
  ]}
  images={(s) => [{ url: frontUrl(s), alt: "Front", caption: "Front: mockup" }, { url: backUrl(s), alt: "Back" }]}
  aside={(s) => <PrintCoverage garment={measurements[s.size]} print={[15, 18]} size={s.size} />}
  onAdd={(selection, quantity) => addSampleToCart(selection, quantity)}
  addLabel="Add sample to cart · $1.00"
/>
```

Values can carry `badge`, `swatch`, `description` and `disabled`. `hideWhenSingle` hides an option's chips when it has only one value (it is still chosen). `onAdd` may return `{ ok: false, error }` or throw; the message is shown.

## Provider catalog components

Built for browsing a print-on-demand provider's catalog and bringing products into the store (the reference storefront's `/admin/printful` pages use all of them). Plain props, nothing provider-specific.

- `CatalogGrid`: every item as a searchable grid with a select per facet, an "in store only" switch, "In store" marks linking to the store products, and paging. Filters in the browser, so pass the whole list. `filterCatalogItems` is the same filter.
- `CatalogItemDetail`: picture and description, a colour by size table with each variant's cost and stock, and the print areas with sizes. Children render underneath.
- `BringOverForm`: name, slug, technique, colours, sizes with upcharges, price and an art URL per placement; "Work out costs" calls `onPlan` for a cost and margin table (negative margins in the danger colour), "Bring over" calls `onSubmit`. `disabledReason` shows it without allowing a submit.
- `PlacementPreview`: the provider's template image with the art drawn exactly over the print area (under an "overlay" template, over a "background" one), and a warning when the art's pixel size or shape doesn't match (`artFitWarning`). `PlacementArtEditor` adds a URL field with save and remove, and with `onUpload` a file upload (PNG or JPEG, 4 MB by default).
- `MockupGallery`: choose variants, request mockups, wait for them (polling `onPoll`), and keep chosen ones in order (`onSave`). A refused request can say when to try again.
