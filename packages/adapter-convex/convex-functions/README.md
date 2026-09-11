# Convex functions for `@mercatus-liber/adapter-convex`

Convex's own real dev model needs the actual server-side query/mutation
functions to live **inside your own Convex project** (they get deployed via
`npx convex dev` / `npx convex deploy`, and that deploy step generates
`convex/_generated/server.ts`/`api.ts` these files import from) -- there is
no way to ship a generic client that runs arbitrary queries against any
Convex deployment the way a SQL client or `mongodb.Db` can. This is a real,
structural difference from the other reference persistence adapters in
this repo (adapter-postgres, adapter-sqlite, adapter-mongodb), not an
oversight.

So this directory ships the actual, real, correct Convex function source
`@mercatus-liber/adapter-convex`'s client (`createConvexAdapter`) calls by
name -- copy these 4 files verbatim into your own Convex project's
`convex/` directory, then run `npx convex dev` (or `npx convex deploy` for
production) to deploy them. Once deployed, `createConvexAdapter` (given
your deployment's real `CONVEX_URL`) works against them with zero further
code changes.

## Setup

1. `npm install convex` in your own project (if you don't already have a
   Convex project set up, `npx convex dev` bootstraps one interactively --
   this is a real, one-time, browser-based login/project-creation step only
   you can do, same as this repo's published Provider Setup Checklist
   discloses for Supabase/Clerk/Sanity).
2. Copy `schema.ts`, `products.ts`, `skus.ts`, `attributes.ts` from this
   directory into your project's `convex/` folder.
3. `npx convex dev` (development) or `npx convex deploy` (production) --
   Convex's own CLI generates `convex/_generated/server.ts`/`api.ts` against
   these files at that point; they do not exist, and these 4 files will not
   typecheck, until you do this.
4. Set `CONVEX_URL` to your deployment's real HTTP API URL (shown by the
   CLI after deploying, and in your Convex dashboard -- looks like
   `https://<your-deployment-name>.convex.cloud`).

## Why `externalId`, not Convex's own `_id`

Convex generates its own branded `Id<"products">` type per table -- it is
not a plain string this framework's own `Product.id` (a UUID this
framework generates itself) can be substituted for. Every table below
instead stores our own id in a real, indexed `externalId` field and is
always queried by that index, never by Convex's internal `_id` -- the
adapter maps `externalId` back to `Product.id`/`Sku.id` on every read. This
is a normal, real pattern for wrapping an external system whose own
primary-key type you don't control (the same reason this framework's other
adapters use `TEXT PRIMARY KEY id` columns rather than each database's own
auto-increment/native-id feature).
