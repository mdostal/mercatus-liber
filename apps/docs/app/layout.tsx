import type { Metadata } from 'next'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s - Mercatus Liber Docs',
    default: 'Mercatus Liber Docs'
  },
  description: 'Documentation for Mercatus Liber: architecture and subsystem reference.'
}

// bs-03-docs-site-and-favicon: HSL derived from brand-system.yaml's real hex tokens
// (Ledger Indigo #4338A0 -> H246 S48% L42%; Paper Neutral #F3F3F1 -> rgb(243,243,241);
// Carbon Ink #1A1A1D -> rgb(26,26,29)) rather than picked by eye. Dark-mode lightness is
// raised from 42% to 58% (same hue/saturation) for legibility against the near-black
// surface -- the same light-vs-dark lightness-delta pattern Nextra's own default color
// prop already uses (45% light / 55% dark), just anchored to this brand's hue/saturation
// instead of Nextra's stock blue.
const navbar = (
  <Navbar
    logo={
      <b
        style={{
          fontFamily: 'var(--x-font-mono)',
          fontWeight: 600,
          letterSpacing: '-0.01em'
        }}
      >
        Mercatus Liber <span style={{ opacity: 0.6, fontWeight: 400 }}>Docs</span>
      </b>
    }
    projectLink="https://github.com/mercatus-liber/mercatus-liber"
  />
)

const footer = (
  <Footer>
    MIT {new Date().getFullYear()} © Mercatus Liber.
  </Footer>
)

export default async function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head
        color={{
          hue: 246,
          saturation: 48,
          lightness: { light: 42, dark: 58 }
        }}
        backgroundColor={{
          light: '#F3F3F1',
          dark: '#1A1A1D'
        }}
      >
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/mercatus-liber/mercatus-liber/tree/main/apps/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
