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
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/demo/${demoSlug}/admin`)}`);
  }

  return (
    <div>
      {/*
        a11y-audit: this used to be a second <header>, rendering as a
        sibling of the outer demo layout's own NavChrome (which itself
        renders a <header>, e.g. nav-top-bar.tsx's "ed-nav" for editorial/8
        other bundles) -- neither was nested inside main/article/aside/
        section, so both got the HTML spec's implicit ARIA "banner" role.
        Confirmed live via axe-core on /admin/catalog: "Document has more
        than one banner landmark" -- a rule that requires AT MOST ONE
        banner landmark per page, full stop (unlike landmark-unique, a
        distinguishing aria-label does NOT satisfy this one; tried that
        first, axe still flagged it). This small "signed in as X" bar was
        never really the page's primary banner anyway. A bare <div> dropped
        the implicit role but then axe's "region" rule flagged it as page
        content outside any landmark (this bar sits outside every admin
        page's own <main>) -- <section aria-label="..."> is the fix that
        satisfies both: it's a real, named "region" landmark (not "banner"),
        so it's contained AND doesn't reintroduce the duplicate-banner issue.
      */}
      <section
        aria-label="Admin session"
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
      </section>
      {children}
    </div>
  );
}
