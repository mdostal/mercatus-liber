import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDemoSlug } from "../../../../../../../lib/demos";
import { runX3dSync } from "../../../../../../../lib/fulfillment-sync";
import { getServicesForDemo } from "../../../../../../../lib/services";

/** Reads one demo store's open X3D Studios orders and publishes what changed. See lib/fulfillment-sync.ts. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ demoSlug: string }> }): Promise<NextResponse> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) return NextResponse.json({ error: "unknown_store" }, { status: 404 });
  const { pollX3dOrders } = await getServicesForDemo(demoSlug);
  const outcome = await runX3dSync(pollX3dOrders, process.env.X3D_SYNC_SECRET, request.headers.get("authorization"));
  return NextResponse.json(outcome.body, { status: outcome.status });
}
