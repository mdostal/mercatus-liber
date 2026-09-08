# AI/MCP Interface — open question resolutions

docs/subsystems/14-ai-mcp-interface.md left 4 open questions. This epic resolves all 4.

## 1. Authorization model for write operations

**Resolved: tiered by actual risk, no new auth subsystem invented.**

- **Shopper reads** (`search_products`, `get_product`, `get_cart`, `get_order_status`) — execute
  directly. Read-only, no risk.
- **Low-risk shopper writes** (`add_to_cart`) — execute directly. A cart mutation is reversible
  and spends nothing.
- **`start_checkout`** — executes directly too, but this is not "trusting the agent with money":
  the handler only ever returns a Stripe-hosted redirect URL. It never completes a charge. Stripe's
  own hosted checkout page — which requires a human to actually enter payment details and confirm
  — **is** the human-in-the-loop step the doc's open question asked for. Inventing a second
  confirmation layer on top of that would be redundant, not safer.
- **Admin writes** (`create_product`, `update_product`, `manage_cms_page`, `adjust_inventory`) —
  require an explicit `confirm: true` input field. Called without it, the handler returns
  `{ requiresConfirmation: true, preview: {...} }` instead of executing. This is the doc's own
  suggested pattern ("the tool call returns 'confirm this purchase' rather than executing
  directly") applied to admin mutations, which are the actual "changes public-facing content"
  risk category the doc names.

No API-key-per-agent or OAuth-delegated-auth scheme was built. That's a real gap for a
multi-tenant deployment (see the deploy-tool epic's eventual scope) but out of place here: this
subsystem's job is the operation surface and its risk-tiering, not identity/session management,
which belongs to whatever hosts it (the reference storefront today; a real admin-auth concept
later, per the doc's own "Depends on" framing).

## 2. Rate limiting / abuse prevention

**Resolved: explicitly deferred, documented as a non-blocking follow-up.** Nothing in this
subsystem's shape prevents adding it later (a request-count check ahead of the CallTool handler,
or at the transport layer) — it just isn't built now, because it isn't required to prove the
core positioning ("an AI/human commerce tool") and doesn't block anything else in the backlog.

## 3. Ship now vs. fast-follow

**Resolved: ship now.** The doc's own condition for shipping ("once the core shopper-side
subsystems exist to actually wrap") is satisfied — `core-foundation`, `cms-pages`, and
`inventory` epics are all done. In hindsight, zero changes were needed to any wrapped
subsystem's public interface to make this wrapping possible, confirming the doc's other
recommendation ("design clean, narrow, documented public interfaces... rather than
retrofitting MCP-friendliness later") actually held.

## 4. Skills packaging format

**Resolved: plain JSON Schema tool definitions, protocol-agnostic.** `tool-definitions.ts` has
zero dependency on MCP or any schema-validation library (no zod) — each definition is a plain
object (`name`, `description`, `category`, `inputSchema` as JSON Schema, `requiresConfirmation`).
The MCP server (`mcp-server.ts`) is a thin wrapper that registers these same definitions as MCP
tools using the SDK's low-level `Server` API, which accepts raw JSON Schema for `inputSchema`
directly — no zod authoring required anywhere in this package. The same tool catalog is legible
to a human developer reading `tool-definitions.ts`, or reusable by a non-MCP integration later,
exactly as the doc asked.
