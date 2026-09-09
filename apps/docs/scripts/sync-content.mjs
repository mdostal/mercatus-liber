#!/usr/bin/env node
/**
 * Build-time content sync for apps/docs.
 *
 * `docs/` (and the repo-root README.md) at the repository root remain the single source of
 * truth for Mercatus Liber's documentation -- this script copies them into apps/docs/content/
 * (Nextra's content directory) so the docs site always renders the current, real docs instead
 * of a hand-maintained, driftable duplicate. The repo-root README is synced to content/readme.md
 * (not content/index.md) -- the docs site's own landing page is hand-authored content specific
 * to this site (see below), not a copy of the repo README or commerce.mdostal.com's separate
 * framework-pitch landing page.
 *
 * A second source, apps/docs/content-src/ (committed, unlike content/ itself -- see
 * apps/docs/.gitignore), holds hand-authored pages that belong to this docs site specifically
 * and have no equivalent anywhere else in the repo: today that's index.md (the landing page)
 * and getting-started.md. It's copied in after the synced repo docs below, so its files land in
 * content/ alongside them on every run.
 *
 * Run automatically as the `predev`/`prebuild` step in apps/docs/package.json. Safe to re-run
 * any number of times: it always wipes and regenerates apps/docs/content/ from scratch.
 *
 * Content extensions: Nextra 4 recognizes both `.md` and `.mdx` files in its content directory
 * (confirmed via nextra's own compiled source, `MARKDOWN_EXTENSION_RE = /\.mdx?$/` in
 * dist/server/constants.js), so the existing `.md` sources are copied as-is -- no rename to
 * `.mdx` is required.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// apps/docs -> apps -> <repo root>
const repoRoot = join(__dirname, '..', '..', '..')
const appRoot = join(__dirname, '..')
const contentDir = join(appRoot, 'content')
const handAuthoredDir = join(appRoot, 'content-src')
const epicsDir = join(repoRoot, '.pHive', 'epics')
const planningDir = join(contentDir, 'planning')

const sources = [
  {
    from: join(repoRoot, 'README.md'),
    to: join(contentDir, 'readme.md')
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

// Planning corpus: every epic's real `.pHive/epics/<name>/docs/design-discussion.md` is synced
// into content/planning/<epic-name>.md so the public docs site can render the actual design
// reasoning behind this project's own work, not just conclusions. Mirrors the docs/subsystems
// sync above (same wipe-and-regenerate discipline), extended here rather than split into a
// sibling script since it's the same "walk a source tree, copy markdown into content/" shape as
// the `sources` loop above -- a separate script would just duplicate the existsSync/mkdirSync/
// cpSync boilerplate for no real separation of concerns. Only the actual design-reasoning content
// is preserved unmodified; a light front-matter-style heading is prepended noting the source epic
// so a reader landing on the synced page knows where it came from.
mkdirSync(planningDir, { recursive: true })

let planningCount = 0
if (existsSync(epicsDir)) {
  const epicNames = readdirSync(epicsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const epicName of epicNames) {
    const source = join(epicsDir, epicName, 'docs', 'design-discussion.md')
    if (!existsSync(source)) continue

    const body = readFileSync(source, 'utf8')
    const dest = join(planningDir, `${epicName}.md`)
    const banner =
      `<!-- Synced from .pHive/epics/${epicName}/docs/design-discussion.md -- ` +
      `content below is unmodified. -->\n\n` +
      `> Planning corpus: this is the real design-discussion doc for epic **${epicName}**, ` +
      `synced verbatim from this repo's own internal planning process.\n\n`
    writeFileSync(dest, banner + body)
    planningCount++
  }
}
console.log(`[sync-content] synced ${planningCount} planning doc(s) -> ${planningDir}`)

// Hand-authored, docs-site-only pages (landing page, getting-started, ...) copied in last so
// they land in content/ alongside the synced repo docs above. This directory is real, committed
// source (unlike content/ itself), so these pages survive every predev/prebuild wipe-and-
// regenerate cycle instead of needing to be written directly into the gitignored content/ dir.
if (!existsSync(handAuthoredDir)) {
  throw new Error(`[sync-content] expected hand-authored content dir does not exist: ${handAuthoredDir}`)
}
cpSync(handAuthoredDir, contentDir, { recursive: true })
console.log(`[sync-content] synced ${handAuthoredDir} -> ${contentDir}`)

console.log('[sync-content] done.')
