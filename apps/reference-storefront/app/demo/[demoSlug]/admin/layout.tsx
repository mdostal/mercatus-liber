import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";

/**
 * Same signal lib/services.ts uses to choose the real Clerk adminAuth
 * adapter over the dev default -- reused here to decide whether it's safe
 * to render Clerk's own <UserButton/> UI. <UserButton/> requires a mounted
 * <ClerkProvider/> (only present in app/layout.tsx when Clerk is actually
 * configured, for the same "don't crash local dev without a live Clerk
 * account" reason middleware.ts documents), so this must stay in lockstep
 * with that check.
 */
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

/**
 * admin-auth-03: shared parent for every existing app/admin/**\/page.tsx --
 * Next.js App Router applies a layout.tsx to every nested route beneath it
 * automatically, so none of those pages needed to change for this story.
 *
 * This is the second, defense-in-depth authorization layer alongside
 * middleware.ts's authentication check (design-discussion.md §3): it calls
 * the wired adminAuth service's own getCurrentSession() (Clerk when
 * configured, the dev default otherwise) and redirects to a sign-in path
 * when there's no session at all. In a real Clerk deployment, middleware.ts
 * already redirects unauthenticated /admin requests to Clerk's own sign-in
 * flow before this layout ever renders -- this check exists for the cases
 * middleware can't cover alone (a session that middleware accepted but that
 * this adapter no longer considers valid, and the dev-default adapter's
 * local-development mode, which has no Clerk middleware running at all).
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ demoSlug: string }>;
}) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { adminAuth } = await getServicesForDemo(demoSlug);
  const session = await adminAuth.getCurrentSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          padding: "8px 12px",
          border: "1px solid #ccc",
          borderRadius: 4,
          background: "#f7f7f7",
          color: "#333",
        }}
      >
        <span>
          Signed in as <strong>{session.email}</strong> ({session.role})
        </span>
        {clerkConfigured ? <UserButton /> : null}
      </header>
      {children}
    </div>
  );
}
