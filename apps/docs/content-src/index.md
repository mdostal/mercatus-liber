# Mercatus Liber Documentation

This is the documentation site for **Mercatus Liber** — a free, MIT-licensed, headless
commerce framework built to be AI-agent- and human-accessible from the ground up. If you
landed here from the framework's own pitch page, this site is the other half: not "why
Mercatus Liber," but "how Mercatus Liber actually works, and how to run one."

## Start here

- **[Getting started](/getting-started)** — the fastest way in: run one of the three live demo
  storefronts already seeded in this repo, or provision your own store with the `create-store`
  CLI.
- **[Architecture](/architecture)** — design principles, the subsystem map, repo shape, and the
  prime directive (no subsystem imports another subsystem's internals).
- **[Subsystem reference](/subsystems/00-core-schema)** — one doc per subsystem (26 total),
  each covering purpose, dependencies, responsibilities, explicit non-responsibilities, and
  open questions. Browse the sidebar for the full list, from `00-core-schema` through
  `25-storefront-views`.
- **[Planning corpus](/planning-index)** — the real design-discussion behind every epic this
  project has shipped: the actual reasoning, rejected alternatives, and evidence, not just
  conclusions. Browse the sidebar's "planning" section for the full list.

## What's covered here vs. elsewhere

This site is generated from the same real, hand-written docs that live in this monorepo's
`docs/` tree and root `README.md` — a build-time sync script copies them in so this site never
drifts into a second, hand-maintained source of truth. Two pages here are genuinely new,
written for this site specifically: this landing page and [Getting started](/getting-started).
Everything else — [Architecture](/architecture), the [subsystem reference](/subsystems/00-core-schema),
and the [full project README](/readme) (status, license, why this project exists at all) — is
synced straight from the repository.

## Status

Mercatus Liber is pre-alpha. See the [project README](/readme) for the current build-out
status and what's done so far.
