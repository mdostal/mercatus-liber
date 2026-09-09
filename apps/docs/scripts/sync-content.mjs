#!/usr/bin/env node
/**
 * Build-time content sync for apps/docs.
 *
 * `docs/` (and the repo-root README.md) at the repository root remain the single source of
 * truth for Mercatus Liber's documentation -- this script copies them into apps/docs/content/
 * (Nextra's content directory) so the docs site always renders the current, real docs instead
 * of a hand-maintained, driftable duplicate.
 *
 * Run automatically as the `predev`/`prebuild` step in apps/docs/package.json. Safe to re-run
 * any number of times: it always wipes and regenerates apps/docs/content/ from scratch.
 *
 * Content extensions: Nextra 4 recognizes both `.md` and `.mdx` files in its content directory
 * (confirmed via nextra's own compiled source, `MARKDOWN_EXTENSION_RE = /\.mdx?$/` in
 * dist/server/constants.js), so the existing `.md` sources are copied as-is -- no rename to
 * `.mdx` is required.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// apps/docs -> apps -> <repo root>
const repoRoot = join(__dirname, '..', '..', '..')
const appRoot = join(__dirname, '..')
const contentDir = join(appRoot, 'content')

const sources = [
  {
    from: join(repoRoot, 'README.md'),
    to: join(contentDir, 'index.md')
  },
  {
    from: join(repoRoot, 'docs', 'ARCHITECTURE.md'),
    to: join(contentDir, 'architecture.md')
  },
  {
    from: join(repoRoot, 'docs', 'subsystems'),
    to: join(contentDir, 'subsystems')
  }
]

// Always regenerate content/ from scratch so stale, removed, or renamed source docs never
// linger in the synced output.
if (existsSync(contentDir)) {
  rmSync(contentDir, { recursive: true, force: true })
}
mkdirSync(contentDir, { recursive: true })

for (const { from, to } of sources) {
  if (!existsSync(from)) {
    throw new Error(`[sync-content] expected source file/dir does not exist: ${from}`)
  }
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`[sync-content] synced ${from} -> ${to}`)
}

console.log('[sync-content] done.')
