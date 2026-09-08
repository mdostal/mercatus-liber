/** Simple style-token map: token name -> CSS value. Deliberately unopinionated about format. */
export type StyleTokens = Record<string, string>;

export interface LayoutTemplate {
  /** e.g. "pdp.tabbed-detail" -- namespaced by page type. */
  key: string;
  pageType: string;
  label: string;
  description: string;
}

export interface ThemingService {
  registerTemplate(template: LayoutTemplate): void;
  listTemplates(pageType: string): LayoutTemplate[];
  /** Explicit override wins; else the deployment's configured default; else the first registered template for that page type, deterministically (registration order). */
  resolveTemplate(pageType: string, override?: string): string | null;
  setDefaultTemplate(pageType: string, templateKey: string): void;
  getTokens(): StyleTokens;
  setTokens(tokens: StyleTokens): void;
}
