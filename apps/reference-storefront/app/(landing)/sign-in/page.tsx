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
    <main
      style={{
        maxWidth: 360,
        margin: "80px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Admin Sign In</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        Dev-default authentication. Enter the owner password (<code>ADMIN_DEV_PASSWORD</code>) for full access, or
        the read-only viewer password (<code>ADMIN_VIEWER_PASSWORD</code>, when configured) to look around without
        being able to change anything.
      </p>
      {hasError ? (
        <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 12 }}>
          Incorrect password. Try again.
        </p>
      ) : null}
      <form action={signInDevAction}>
        <input type="hidden" name="redirect_url" value={redirectUrl} />
        <label htmlFor="password" style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
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
            border: "1px solid #ccc",
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
            background: "#1c1917",
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
        <a href="/" style={{ fontSize: 13, color: "#666" }}>
          &larr; Back to Mercatus Liber
        </a>
      </p>
    </main>
  );
}
