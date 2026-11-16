import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDemoSlug } from "../../../../../../../lib/demos";
import { receiveFulfillmentWebhook } from "../../../../../../../lib/fulfillment-webhooks";
import { getServicesForDemo } from "../../../../../../../lib/services";

/**
 * Status webhooks from a print-on-demand provider (`printful`, `slant3d` or
 * `3dapi`) for one demo store. Point the provider's webhook at
 * `https://<host>/api/demo/<demoSlug>/fulfillment/<provider>/webhook` and set
 * its secret (PRINTFUL_WEBHOOK_SECRET_KEY, SLANT3D_WEBHOOK_SECRET or
 * DAPI_WEBHOOK_SECRET); without the
 * secret the provider is not listed and this answers 404. The raw body is read
 * as text because the signature covers the exact bytes sent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ demoSlug: string; provider: string }> }): Promise<NextResponse> {
  const { demoSlug, provider } = await params;
  if (!isDemoSlug(demoSlug)) return NextResponse.json({ error: "unknown_store" }, { status: 404 });
  const { fulfillmentWebhooks } = await getServicesForDemo(demoSlug);
  const rawBody = await request.text();
  const outcome = await receiveFulfillmentWebhook(fulfillmentWebhooks, provider, request.headers, rawBody);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
