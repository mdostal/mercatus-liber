import type { ReactNode } from "react";

export const metadata = {
  title: "Mercatus Liber -- Reference Storefront",
  description: "Minimal integration proof for Mercatus Liber's core-foundation packages.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 24 }}>
        <header style={{ marginBottom: 24, borderBottom: "1px solid #ddd", paddingBottom: 12 }}>
          <a href="/" style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}>
            Mercatus Liber -- Reference Storefront
          </a>
          {" · "}
          <a href="/cart">Cart</a>
        </header>
        {children}
      </body>
    </html>
  );
}
