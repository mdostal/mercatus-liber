import { isDemoSlug } from "../../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../../lib/services";

export const dynamic = "force-dynamic";

/** The store API for outside apps such as flayr. See @mercatus-liber/store-api and docs/integrations/flayr.md. */
async function handle(request: Request, { params }: { params: Promise<{ demoSlug: string }> }): Promise<Response> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) return Response.json({ error: { code: "not_found", message: "No such store." } }, { status: 404 });
  const { storeApi } = await getServicesForDemo(demoSlug);
  return storeApi(request);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
