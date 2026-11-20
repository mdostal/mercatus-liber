import { serveMediaFile } from "@mercatus-liber/media";
import { DEMO_SLUGS } from "../../../lib/demos";
import { getServicesForDemo } from "../../../lib/services";

/**
 * Files the store keeps itself (Printful mockups saved as product images).
 * Ids are random UUIDs, so each demo's store is asked in turn; with the shared
 * database they are one table.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  for (const slug of DEMO_SLUGS) {
    const response = await serveMediaFile((await getServicesForDemo(slug)).mediaStore, id);
    if (response.status !== 404) return response;
  }
  return new Response("Not found", { status: 404 });
}
