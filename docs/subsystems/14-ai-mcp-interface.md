# Subsystem 14 — AI/MCP Interface

## Purpose
The founder's positioning for the whole project: **"an AI / Human commerce tool — full skills,
full MCP, fully expected to interact and [be] used"** by AI agents, not just humans through a
web UI. This subsystem exposes the framework's capabilities — shopping (search, browse, cart,
checkout, order status) and, on the admin side, catalog/CMS/order management — as an **MCP
server** and a documented **skills/tool-definition set**, so any MCP-compatible agent (or a
human via the normal storefront/admin UI) can operate the same underlying commerce operations.
This is a genuine differentiator: no evaluated commerce platform (Medusa, Saleor, Vendure,
Shopify, etc.) treats agent access as a first-class interface rather than an afterthought API.

## Depends on
The **public interfaces** of every subsystem it exposes — catalog (01) for search/browse,
cart (07) for cart operations, checkout-orders (09) for checkout and order status,
marketing-catalog (02)/search (03) for discovery, and (admin side) catalog/CMS (05)/inventory
(11) write operations. Like plugins (12), this subsystem depends on other subsystems' public
interfaces; no subsystem depends on this one. It's an interface layer, not a business-logic
owner — every operation it exposes just calls the same interface a human-facing UI would call.

## Responsibilities
- **MCP server:** exposes commerce operations as MCP tools/resources — e.g.
  `search_products`, `get_product`, `add_to_cart`, `get_cart`, `start_checkout`,
  `get_order_status` on the shopper side; `create_product`, `update_product`,
  `manage_cms_page`, `adjust_inventory` on the admin side (gated behind whatever auth/
  permission model account (10) and a to-be-defined admin-auth concept establish — an AI agent
  acting on the admin surface must authenticate the same way a human admin would, not through a
  separate trust-bypassing channel).
- **Skills/tool definitions:** a documented, versioned catalog of what operations exist, their
  input/output schemas, and example invocations — the same content the MCP server exposes,
  packaged for discovery/reference independent of the MCP protocol itself (so the same
  capability set is legible to a human developer, not just machine-consumed).
- Every exposed operation delegates to the same subsystem interface a human-facing app would
  call — this subsystem has zero duplicated business logic. If checkout has a bug, it has the
  bug whether triggered by a human clicking "buy" or an agent calling `start_checkout`.
- Read operations (search, browse, order status) are naturally low-risk; write operations
  (checkout, admin mutations) need an explicit confirmation/authorization contract — this
  subsystem should model "agent proposes, human or a defined policy approves" for anything
  that spends money or changes public-facing content, not assume every agent caller is
  automatically trusted to act unattended.

## Explicitly NOT this subsystem's job
- Owning business logic (every subsystem it wraps still owns its own logic and validation —
  this is purely an interface/protocol adapter, structurally identical in spirit to how a REST
  API layer would wrap the same interfaces, just MCP-shaped instead).
- Deciding what's exposed to agents vs. humans differently in terms of *correctness* — the same
  validation, pricing, and inventory rules apply regardless of caller. It may differ in *policy*
  (what an agent is allowed to do unattended) but never in *what the underlying operation does*.

## Decoupling notes
This subsystem is architecturally a sibling to `apps/reference-storefront` — both are
**consumers** of the framework's subsystem interfaces, not part of the core dependency graph
other subsystems rely on. Deleting this subsystem removes AI-agent access; every other
subsystem keeps working exactly as before, proving it was never load-bearing for core
functionality — same test as plugins (12) and analytics (13).

## Open questions
1. Authorization model for write operations — API-key-per-agent, OAuth-style delegated auth
   tied to a real customer/admin account, or a human-in-the-loop confirmation step built into
   the MCP tool responses themselves (the tool call returns "confirm this purchase" rather than
   executing directly)?
2. Rate limiting / abuse prevention specific to agentic traffic (a misbehaving or looping agent
   hammering `search_products` looks different from a human's request pattern).
3. Does this ship as its own package from v1, or is it a fast-follow once the core shopper-side
   subsystems (catalog/cart/checkout) exist to actually wrap? Recommend: fast-follow — there's
   nothing to expose via MCP until epic `core-foundation` (catalog/cart/checkout) exists, but
   design the interfaces in that epic with this subsystem's needs in mind (clean, narrow,
   documented public interfaces per subsystem) rather than retrofitting MCP-friendliness later.
4. Skills packaging format — plain documented JSON Schema tool definitions (protocol-agnostic,
   reusable outside MCP too) vs. MCP-specific manifest only?
