import { signInDevAction } from "../../../lib/actions";

export const metadata = {
  title: "Admin Sign In",
  description: "Sign in to the Mercatus Liber admin dashboard.",
};

/**
 * The dev-default admin sign-in page -- only ever reached when
 * CLERK_SECRET_KEY is unset. When Clerk IS configured, middleware.ts's
 * auth.protect() redirects unauthenticated /admin visits to Clerk's own
 * hosted sign-in flow before this route is ever hit, so this page carries
 * no ClerkProvider and no Clerk UI -- it's a plain form for the dev-default
 * single-password model documented in packages/admin-auth/src/
 * default-adapter.ts (NOT a production security boundary; the real,
 * deployed implementation is @mercatus-liber/adapter-clerk).
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectUrl = params.redirect_url ?? "/";
  const hasError = params.error === "1";

  return (
    /*
     * bs-02-landing-page-brand: this page's inline styles (Next.js's App
     * Router boundary pages can't rely on app/(landing)/layout.tsx's LANDING_CSS
     * classes being the styling *system* here, just its fonts/root, since this
     * form predates that shared CSS) now use the real brand tokens directly --
     * Carbon Ink #1A1A1D for ink, Ledger Indigo #4338A0 for the primary CTA
     * (colors.primary usage: "primary CTAs"), Garnet #A13A3A for the error
     * state (colors.secondary usage: "alerts"), Public Sans (loaded globally
     * by the shared (landing) root layout's <head>), and the brand's tight
     * 4px medium radius.
     */
    <main
      style={{
        maxWidth: 360,
        margin: "80px auto",
        padding: 24,
        fontFamily: "'Public Sans', system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#1a1a1d" }}>Admin Sign In</h1>
      <p style={{ color: "#5a5a5e", fontSize: 14, marginBottom: 20 }}>
        Dev-default authentication. Enter the owner password (<code>ADMIN_DEV_PASSWORD</code>) for full access, or
        the read-only viewer password (<code>ADMIN_VIEWER_PASSWORD</code>, when configured) to look around without
        being able to change anything.
      </p>
      {hasError ? (
        <p style={{ color: "#a13a3a", fontSize: 14, marginBottom: 12 }}>
          Incorrect password. Try again.
        </p>
      ) : null}
      <form action={signInDevAction}>
        <input type="hidden" name="redirect_url" value={redirectUrl} />
        <label htmlFor="password" style={{ display: "block", fontSize: 14, marginBottom: 4, color: "#1a1a1d" }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid #dedcd9",
            borderRadius: 4,
            marginBottom: 12,
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            fontWeight: 600,
            background: "#4338a0",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
      <p style={{ marginTop: 20 }}>
        <a href="/" style={{ fontSize: 13, color: "#5a5a5e" }}>
          &larr; Back to Mercatus Liber
        </a>
      </p>
    </main>
  );
}
