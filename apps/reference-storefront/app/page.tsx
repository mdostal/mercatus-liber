import { CmsSection } from "../components/cms-sections";
import { getServices } from "../lib/services";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { cms } = await getServices();
  const home = await cms.getPageBySlug("home");

  if (!home) {
    return (
      <main>
        <h1>Home</h1>
        <p>No home page configured yet.</p>
      </main>
    );
  }

  return (
    <main>
      {home.sections.map((section, i) => (
        // Sections are an ordered list, not individually id-addressable in this minimal demo -- index is a stable enough key here.
        <CmsSection key={i} section={section} />
      ))}
    </main>
  );
}
