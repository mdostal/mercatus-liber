import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
import type { MDXComponents } from 'nextra/mdx-components'

const docsComponents = getDocsMDXComponents()

export const useMDXComponents = (components?: MDXComponents): MDXComponents => ({
  ...docsComponents,
  ...components
})
