/**
 * scc-07: the one module allowed to turn lib/copilot's app-agnostic backend
 * (an injectable AnthropicClient + injectable SanityContextClient + a
 * tool-calling loop, all built and unit-tested in scc-06 against fakes)
 * into something this app's admin routes can actually call -- same job
 * lib/services.ts does for every other swappable subsystem: env var truthy
 * picks the real adapter, else an honest fallback, never silently.
 *
 * `isCopilotConfigured()` mirrors lib/adapter-info.ts's own per-subsystem
 * checks exactly (e.g. its cmsInfo()'s `process.env.SANITY_PROJECT_ID`
 * check): a plain, fresh-every-call `Boolean(process.env.ANTHROPIC_API_KEY)`,
 * no caching. As of this story (2026-09-19) that is genuinely false in this
 * environment -- see lib/copilot/anthropic-client.ts's header comment for
 * the real, disclosed Portunus check scc-06 performed -- so
 * app/demo/[demoSlug]/admin/copilot/page.tsx renders the honest
 * "not configured" state instead of this module's real path.
 *
 * `runDemoCopilotTurn`/`applyCopilotOption` both take an optional
 * `overrides` param for an injected AnthropicClient/SanityContextClient --
 * the exact same injectable-fake seam scc-06's own test suite
 * (test/copilot-loop.test.ts) already established, so this story's tests
 * (test/copilot-runtime.test.ts) exercise the real permission/confirm/
 * CmsService-write wiring below without needing a live Anthropic credential
 * either.
 */
import {
  createAnthropicClient,
  createCopilotToolHandlers,
  createSanityContextClient,
  runCopilotTurn,
  type AnthropicClient,
  type CopilotToolDeps,
  type CopilotTurnResult,
  type ProposalShape,
  type SanityContextClient,
  type ToolResult,
} from "./copilot/index";
import { isDemoSlug, type DemoSlug } from "./demos";
import { getServicesForDemo } from "./services";

/** Same "env var truthy" check every other optional adapter in this app uses -- see this file's header comment. */
export function isCopilotConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Sanity Context MCP is a *second*, independently-optional credential -- see lib/copilot/sanity-context-client.ts's header comment for why no org-scoped token exists in this environment either. */
function isSanityContextConfigured(): boolean {
  return Boolean(process.env.SANITY_TOKEN && process.env.SANITY_CONTEXT_ORG_ID);
}

export interface CopilotRuntimeOverrides {
  anthropic?: AnthropicClient;
  sanityContext?: SanityContextClient;
}

async function buildDeps(demoSlug: DemoSlug, overrides?: CopilotRuntimeOverrides): Promise<CopilotToolDeps> {
  const { cms, theming, adminAuth } = await getServicesForDemo(demoSlug);
  const session = await adminAuth.getCurrentSession();

  const sanityContext =
    overrides?.sanityContext ??
    (isSanityContextConfigured()
      ? createSanityContextClient({
          organizationId: process.env.SANITY_CONTEXT_ORG_ID!,
          mcpEndpointName: process.env.SANITY_CONTEXT_ENDPOINT_NAME ?? "default",
          token: process.env.SANITY_TOKEN!,
        })
      : undefined);

  return { cms, theming, session, sanityContext };
}

function resolveAnthropicClient(overrides?: CopilotRuntimeOverrides): AnthropicClient {
  if (overrides?.anthropic) return overrides.anthropic;
  if (!isCopilotConfigured()) {
    throw new Error(
      "Copilot is not configured: ANTHROPIC_API_KEY is not set. Callers must check isCopilotConfigured() before invoking runDemoCopilotTurn.",
    );
  }
  return createAnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

export interface DemoCopilotTurnInput {
  demoSlug: string;
  requestText: string;
  maxIterations?: number;
}

/**
 * Runs one full admin<->Claude turn (propose stage) for a given demo,
 * through the real lib/copilot tool-calling loop. Requires an authenticated
 * admin session (any role -- this is "view"-level access, same bar as every
 * other admin page); `apply_option` calls the loop itself makes (e.g. the
 * admin free-texting "apply option b") are still independently gated by
 * lib/copilot/permission.ts's requireMutatePermission, same as scc-06's own
 * dev-roundtrip.ts Turn 2.
 */
export async function runDemoCopilotTurn(
  input: DemoCopilotTurnInput,
  overrides?: CopilotRuntimeOverrides,
): Promise<CopilotTurnResult> {
  if (!isDemoSlug(input.demoSlug)) {
    throw new Error(`runDemoCopilotTurn: unknown demo slug ${JSON.stringify(input.demoSlug)}`);
  }
  const anthropic = resolveAnthropicClient(overrides);
  const deps = await buildDeps(input.demoSlug, overrides);
  if (!deps.session) {
    throw new Error("Not authorized: an authenticated admin session is required to use the content copilot.");
  }

  return runCopilotTurn(anthropic, deps, {
    requestText: input.requestText,
    maxIterations: input.maxIterations,
  });
}

export interface ApplyCopilotOptionInput {
  demoSlug: string;
  shape: ProposalShape;
  pageType: string;
  slug: string;
  chosen: Record<string, unknown>;
}

/**
 * The deterministic "admin clicked Apply on this exact rendered card" path
 * -- calls handlers.ts's apply_option directly with confirm:true, the same
 * way scc-06's dev-roundtrip.ts drives it for its own rejection-path proof,
 * rather than re-asking Claude to decide which option to apply (which would
 * make a UI button's effect depend on a second, non-deterministic LLM call).
 * requireMutatePermission (lib/copilot/permission.ts) is still the actual
 * enforcement -- this function adds no second mechanism, just a second,
 * UI-triggered call site into the same one.
 */
export async function applyCopilotOption(
  input: ApplyCopilotOptionInput,
  overrides?: CopilotRuntimeOverrides,
): Promise<ToolResult> {
  if (!isDemoSlug(input.demoSlug)) {
    throw new Error(`applyCopilotOption: unknown demo slug ${JSON.stringify(input.demoSlug)}`);
  }
  const deps = await buildDeps(input.demoSlug, overrides);
  const handlers = createCopilotToolHandlers(deps);
  return handlers.apply_option!({
    shape: input.shape,
    pageType: input.pageType,
    slug: input.slug,
    chosen: input.chosen,
    confirm: true,
  });
}
