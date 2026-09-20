import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@mercatus-liber/admin-auth";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";
import { isCopilotConfigured } from "../../../../../lib/copilot-runtime";
import { CopilotChat } from "./CopilotChat";

export const dynamic = "force-dynamic";

/**
 * scc-07: the AI content copilot's admin chat surface -- see
 * CopilotChat.tsx's own header comment for why that one child component is
 * this repo's first client-side-interactive admin page (a departure from
 * every other admin page's plain-server-RSC-with-form-actions convention,
 * called out explicitly there, not silently introduced). This page itself
 * stays a plain server component, same as every other admin page: it reads
 * the current session/config server-side and either renders the honest
 * "not configured" state or hands the client component only what it
 * genuinely needs (demoSlug, whether this session can mutate) -- never an
 * API key or any server-only credential.
 */
export default async function AdminCopilotPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const configured = isCopilotConfigured();
  const { adminAuth } = await getServicesForDemo(demoSlug);
  const session = await adminAuth.getCurrentSession();
  const canMutate = session ? hasPermission(session.role, "mutate") : false;

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: AI Content Copilot</h1>
      <p style={{ color: "#666" }}>
        Describe a content or layout change in plain language. The copilot (
        <code>lib/copilot</code>, a real Anthropic tool-calling loop) proposes 2-3 concrete
        candidate options, and an admin with mutate permission can apply one -- closing the loop
        into the <Link href={`/demo/${demoSlug}/admin/content-layout`}>Content &amp; Layout dashboard</Link>.
      </p>

      {!configured ? (
        <div
          style={{
            border: "1px solid #c00",
            borderRadius: 4,
            padding: 12,
            color: "#900",
            background: "#fff5f5",
          }}
        >
          <p>
            <strong>AI copilot is not configured for this environment</strong> -- set{" "}
            <code>ANTHROPIC_API_KEY</code> (and optionally <code>SANITY_CONTEXT_MCP_TOKEN</code>) to
            enable it.
          </p>
          <p style={{ color: "#666", fontSize: "0.9em" }}>
            This is the same honest-fallback convention as every other optional adapter in this app
            (see <Link href={`/demo/${demoSlug}/admin/settings`}>Settings</Link>) -- not a broken page,
            and not a fabricated response pretending to be the AI. The rest of the copilot backend
            (<code>lib/copilot/*.ts</code>) is fully built and tested against injectable fakes; only a
            live Anthropic credential is missing in this environment.
          </p>
        </div>
      ) : !session ? (
        <p style={{ color: "#900" }}>No admin session -- sign in to use the copilot.</p>
      ) : (
        <CopilotChat demoSlug={demoSlug} canMutate={canMutate} />
      )}
    </main>
  );
}
