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
  /**
   * scc-04: reads back exactly what the most recent setDefaultTemplate(pageType, ...)
   * call stored for this page type -- null when none has been set. Distinct from
   * resolveTemplate(pageType) (no override arg), which already folds the configured
   * default into a fallback chain ending at the first-registered template and so
   * can't tell a caller "nothing is configured" apart from "the configured default
   * happens to equal the first-registered template's key." A caller composing a
   * SECOND, independent source of per-page-type defaults on top of this service's
   * own (e.g. a whole-bundle theme picker's own per-page-type pick, see
   * reference-storefront's lib/resolve-page-template.ts) needs that distinction to
   * decide which of the two should win for a given page type.
   */
  getConfiguredDefault(pageType: string): string | null;
  getTokens(): StyleTokens;
  setTokens(tokens: StyleTokens): void;
}
