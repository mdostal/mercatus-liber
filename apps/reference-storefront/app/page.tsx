import { CmsSection } from "../components/cms-sections";
import { InteractionTracker } from "../components/interaction-tracker";
import { DEFAULT_DEMO_SLUG } from "../lib/demos";
import { getServicesForDemo } from "../lib/services";

export const dynamic = "force-dynamic";

/**
 * demo-routing-04: this route renders OUTSIDE `/demo/[demoSlug]/...` (it's
 * the pre-story-05 root landing page stub -- design-discussion.md §3 has it
 * becoming a demo-agnostic framework landing page in demo-routing-05), so
 * there is no real demoSlug to thread here. DEFAULT_DEMO_SLUG (lib/demos.ts)
 * is an explicit, named stand-in for that -- not a "TEMPORARY: hardcoded
 * until routes move" shim, since routes have already moved; this is simply
 * this stub's provisional content pending story 05's actual redesign.
 */
export default async function HomePage() {
  const { cms } = await getServicesForDemo(DEFAULT_DEMO_SLUG);
  const home = await cms.getPageBySlug("home");

  if (!home) {
    return (
      <main>
        <InteractionTracker eventName="page_viewed" properties={{ slug: "home" }} />
        <h1>Home</h1>
        <p>No home page configured yet.</p>
      </main>
    );
  }

  return (
    <main>
      <InteractionTracker eventName="page_viewed" properties={{ slug: "home" }} />
      {home.sections.map((section, i) => (
        // Sections are an ordered list, not individually id-addressable in this minimal demo -- index is a stable enough key here.
        <CmsSection key={i} demoSlug={DEFAULT_DEMO_SLUG} section={section} pageSlug="home" />
      ))}
    </main>
  );
}
