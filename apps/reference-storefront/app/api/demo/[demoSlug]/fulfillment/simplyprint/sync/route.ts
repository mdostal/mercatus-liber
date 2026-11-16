import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDemoSlug } from "../../../../../../../lib/demos";
import { runFulfillmentSync } from "../../../../../../../lib/fulfillment-sync";
import { getServicesForDemo } from "../../../../../../../lib/services";

/** Reads one demo store's SimplyPrint print queue and publishes what changed, including finished prints. See lib/fulfillment-sync.ts. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ demoSlug: string }> }): Promise<NextResponse> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) return NextResponse.json({ error: "unknown_store" }, { status: 404 });
  const { pollSimplyPrintQueue } = await getServicesForDemo(demoSlug);
  const outcome = await runFulfillmentSync(pollSimplyPrintQueue, process.env.SIMPLYPRINT_SYNC_SECRET, request.headers.get("authorization"));
  return NextResponse.json(outcome.body, { status: outcome.status });
}
