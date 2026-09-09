import { CmsSection } from "../components/cms-sections";
import { InteractionTracker } from "../components/interaction-tracker";
import { getServicesForDemo } from "../lib/services";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { cms } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
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
        <CmsSection key={i} section={section} pageSlug="home" />
      ))}
    </main>
  );
}
