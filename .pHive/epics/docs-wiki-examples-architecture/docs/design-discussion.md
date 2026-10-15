# Design discussion: docs-wiki-examples-architecture (epic 80)

## 1. Why this epic, and why now

Real user ask, 2026-10-15: "get our SOLID mercatus liber page, with docs, with a wiki, with
sample stores linked out as SEPARATE STORES... etc across the board." Asked what "wiki"
should actually be, the user explicitly declined to pre-pick a surface: "we should have a
set of these and link the docs across, the docs, the wiki, and the examples can all be the
same or different but should be judged and CBA'd fully -- then we get it all in place." This
epic does that real cost-benefit pass, decides, and implements the cross-linking.

## 2. The real CBA

Three candidate surfaces for "the wiki," weighed against what already exists (a live Nextra
docs site at `mercatus-liber-docs.vercel.app`, built from `apps/docs/content-src/*.md` via a
real content-sync script that pulls from `README.md`/`VISION.md`/`docs/subsystems/*.md`):

| Option | Editability | Discoverability / SEO | Maintenance burden | Verdict |
|---|---|---|---|---|
| **GitHub Wiki** (`github.com/mdostal/mercatus-liber/wiki`) | Edit directly in the browser, no deploy, no PR required -- lowest friction for quick notes, FAQs, troubleshooting that changes often | Separate domain/path from the docs site and the main repo; GitHub does index wiki pages, but it's a materially weaker SEO/discovery surface than a real Next.js site with its own sitemap | Near zero -- it's just repo-attached Markdown, no build step | Good for **low-friction, frequently-edited, loosely-structured** content (troubleshooting, FAQ, "why does X demo do Y" notes) that doesn't need to be polished or versioned alongside a release |
| **A new section inside the existing docs site** (`apps/docs`) | Requires a PR + deploy like every other docs page -- higher friction per edit | Best discoverability -- same domain, same sitemap, same nav as the rest of the docs the user already built real traffic-shaping for | Adds pages to an existing, already-maintained build pipeline -- no new infra | Good for **structured, durable reference** content (architecture, adapter catalog, integration guides) that benefits from staying next to the rest of the docs |
| **A separate dedicated tool** (Docusaurus/Mintlify/etc.) | Varies, but in every case means a **third** build pipeline and a third deploy target | Starts from zero discovery/SEO equity; duplicates what `apps/docs` already has | Highest -- a whole new app to keep building/deploying/updating in lockstep with the other two | **Rejected.** This project already has a real, live, working docs site; adding a competing tool for the same job is pure duplicated maintenance with no real benefit over extending what exists. |

**Decision:** use **both** of the first two, for genuinely different jobs, not as a toss-up --
1. **GitHub Wiki** for exactly the loosely-structured, frequently-changing content a wiki is
   actually good at: FAQ, troubleshooting ("why is a demo store asleep," tied directly to
   epic 79), "decisions log"-style notes, and anything a contributor should be able to fix
   in two minutes without a PR.
2. **A new section in the existing docs site** for durable, structured reference that belongs
   next to the architecture/integrations pages already there: this is where the separate
   sample-stores' own URLs (epic 81) get documented and linked, since that's reference
   material, not a FAQ.

This also directly answers "the examples can all be the same or different": the example/demo
stores (epic 81) are **their own distinct surface** (live running stores), linked FROM both
the docs site and the wiki, not merged into either -- a running store and a documentation page
are different kinds of content and shouldn't collapse into one surface.

## 3. Scope

**In scope:**
1. Stand up the real GitHub Wiki with real initial content: FAQ (including the free-tier-
   sleep disclosure from epic 79), troubleshooting, a short decisions log pointing back at the
   real `.pHive/epics/*/docs/design-discussion.md` files for anyone who wants the full
   reasoning behind a choice.
2. Add a new structured reference section to `apps/docs` indexing: the architecture page
   (already live), the integrations catalog (already live, epic 77), and a new "Sample
   Stores" reference page listing each separately-deployed store (epic 81) with its own URL,
   its own backend, and what it demonstrates.
3. Cross-link everything, consistently, from every surface: the root `README.md`, the GitHub
   repo's own "About" section/topics, the docs site's nav, the wiki's own sidebar, and each
   separately-deployed sample store's own footer -- every surface should be able to reach
   every other surface in at most one click.
4. One real "SOLID mercatus liber page" pass on the GitHub repo presentation itself: the repo
   description, topics, and README's top section, so a first-time visitor immediately sees
   links to docs, wiki, and the live separate stores, not just prose.

**Explicitly out of scope:** building the separate-stores deployments themselves (epic 81) --
this epic links to them once they exist, and can land its own cross-linking work before or
after epic 81 lands, as long as the final state links correctly.

## 4. Scale assessment

**Medium.** Mostly content/linking work plus one new docs-site reference page; no new runtime
surface. Proceeding directly to stories.
