import type { Metadata } from 'next'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata: Metadata = {
  title: {
    template: '%s - Mercatus Liber Docs',
    default: 'Mercatus Liber Docs'
  },
  description: 'Documentation for Mercatus Liber: architecture and subsystem reference.'
}

const navbar = (
  <Navbar
    logo={<b>Mercatus Liber Docs</b>}
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
      <Head />
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
