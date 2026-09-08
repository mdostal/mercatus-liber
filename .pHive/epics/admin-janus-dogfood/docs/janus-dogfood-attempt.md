# Janus dogfood attempt — outcome: not viable yet, documented honestly

Epic 10 asks: "attempt to build [the admin view] via Janus's composer (dogfood), fall back to
hand-built admin UI ... if Janus integration isn't viable." This document is that attempt and
its conclusion, per the epic's own allowance that an honest documented non-viability closes
this half of the epic just as well as a success would.

## What Janus actually is

Read directly from `/Users/mdostal/Documents/work/pantheon/janus`'s `README.md` and
`package.json` (not assumed from memory):

- Janus is **the UI/portal capability slot of Pantheon**, not a general-purpose low-code
  page/dashboard builder. It renders the *Pantheon gods* (Consus, Auriga, Heimdall, Argus,
  Portunus, Multica) through a single seam contract (`seam/client.mjs` → `/api/seam/*`) and
  explicitly does not recompute or own any domain logic itself ("Standards + Bridges Only").
- It is a zero-dependency `node:http` host (`server/index.mjs`, default port 8726) plus a CLI
  (`janusctl`, `bin/janus.mjs`) that installs third-party plugins into portal "slots" via a
  `dostal:janus-plugin-ui/v1` contract, and a separate `dostal:plugin-bridge/v1` handshake for
  wiring a god's real backing service into the seam.
- `package.json` marks it `"private": true` — it is not published to npm and has no public
  install path. There is no `janus` binary on this machine's `PATH` (`which janus` → not
  found); it only runs via `node server/index.mjs` from inside its own checkout.

## Why dogfooding it into Mercatus Liber now is the wrong move

1. **It has nothing to render yet.** Janus's whole value is displaying state that already
   exists behind a Pantheon god's contract (Consus decisions, Argus metrics, etc). Mercatus
   Liber's catalog/CMS/order data isn't a Pantheon god and has no `dostal:plugin-bridge/v1`
   adapter — building one means inventing a fake "commerce god" purely to satisfy Janus's
   integration shape, which is scope invented to justify the tool, not scope the epic asked
   for.
2. **It would violate this project's own prime directive.** Mercatus Liber is explicitly
   scoped as a **standalone, MIT-licensed, giftable** framework — "a legit alternative to the
   others," installable by anyone with no dependency on Mathew's private infrastructure. Janus
   is a private (`"private": true`), unpublished, Pantheon-only service living in a sibling
   repo. Taking a hard dependency on it here would mean Mercatus Liber's admin UI only works
   inside Mathew's own machine/ecosystem — directly contradicting the "give this away" goal
   this whole project exists to serve.
3. **The backlog already anticipates this timing.** `.pHive/planning/epic-backlog.md`'s
   "Longer-term destination" note says most of this work is intended to *eventually* move
   under Pantheon, "not scheduled yet." Dogfooding Janus makes sense **after** that move, when
   Mercatus Liber's admin surface has a real reason to live behind Pantheon's seam alongside
   the other gods — not before it, from the outside, as a one-off integration.

## What's still true and worth keeping

The plugin contract itself (`dostal:janus-plugin-ui/v1`: "installable component-by-component,
with zero edits to Janus source") is a good shape to imitate. Mercatus Liber's own
`packages/plugins` subsystem already follows the same philosophy — install-by-registration,
no host edits — which is why the fallback below is built as a plugin-registered admin surface
inside the reference storefront rather than a bespoke one-off.

## Conclusion

**Not viable now. Revisit after the Pantheon migration** referenced in
`mercatus-liber-destination-and-acceptance-test` memory, when a real "commerce god" contract
adapter is worth building. For this epic, proceeding with the documented fallback: a
hand-built admin UI in `apps/reference-storefront/app/admin`, covering catalog, CMS, and order
management, wired the same way the rest of the reference storefront is (`lib/services.ts` as
the only adapter-importing seam, structural interfaces, event-bus where cross-subsystem
reaction is needed).
