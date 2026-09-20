"use client";

/**
 * scc-07: this repo's first admin page whose primary interaction model is
 * client-side (fetch + local React state), not a server-rendered page with
 * a `<form action={serverAction}>` submit -- explicitly called out here per
 * this story's own requirement, not silently introduced.
 *
 * Every other admin page in this repo (catalog, cms, promotions,
 * content-layout, ...) is a plain server RSC: it reads data at render time
 * and mutates via a "use server" form action, which is enough because a
 * plain HTML form POST can complete in one request/response and Next.js
 * re-renders the page for you (see lib/actions.ts). A chat turn can't work
 * that way: it may take several seconds (a real LLM call plus 1-8 tool-use
 * round trips, see lib/copilot/loop.ts's maxIterations), the admin needs to
 * see it in progress (a disabled input, a "thinking" state) rather than the
 * whole page going blank mid-navigation, and the result (2-3 candidate
 * cards) has to be rendered as real UI, not dumped as the next server
 * render's HTML. So this one page trades the "plain server RSC" convention
 * for a small, isolated client component (this file) that POSTs JSON to
 * app/api/demo/[demoSlug]/copilot/route.ts and renders the response --
 * while the actual "apply this option" mutation below still goes through a
 * plain Server Action (lib/copilot-actions.ts's applyCopilotOptionAction),
 * exactly like the rest of the admin app, since that one step genuinely is
 * a single deterministic RPC, not a streaming conversation.
 *
 * Note: apps/reference-storefront/app/demo/[demoSlug]/admin/cms/CmsSectionFields.tsx
 * is also `"use client"`, but only for local useState-driven dynamic form
 * rows inside a page that still submits via a normal server-action `<form>`
 * -- it never fetches anything itself. This file is the first admin surface
 * whose top-level data flow (load candidates, apply one) is client-driven.
 */
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import type { HeroCopyCandidate, ProposalShape, TemplateSwapCandidate } from "../../../../../lib/copilot/types.js";
import { applyCopilotOptionAction } from "../../../../../lib/copilot-actions";

interface RawToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
}

interface CopilotTurnResponse {
  finalText: string;
  toolCalls: RawToolCall[];
  stopReason: string | null;
}

interface ProposedOptionsResult {
  shape: ProposalShape;
  pageType: string;
  slug: string;
  candidates: (HeroCopyCandidate | TemplateSwapCandidate)[];
}

type ApplyStatus = { kind: "idle" } | { kind: "success"; detail: string } | { kind: "error"; message: string };

interface ChatTurn {
  id: string;
  requestText: string;
  status: "pending" | "done" | "error";
  response?: CopilotTurnResponse;
  errorMessage?: string;
}

function isHeroCandidate(c: HeroCopyCandidate | TemplateSwapCandidate): c is HeroCopyCandidate {
  return typeof (c as HeroCopyCandidate).headline === "string";
}

function isProposeOptionsResult(value: unknown): value is ProposedOptionsResult {
  const r = value as ProposedOptionsResult | undefined;
  return !!r && (r.shape === "swap_hero_copy" || r.shape === "swap_template") && Array.isArray(r.candidates);
}

function isPendingConfirmationResult(value: unknown): boolean {
  return !!value && typeof value === "object" && (value as Record<string, unknown>).requiresConfirmation === true;
}

let turnCounter = 0;
function nextId(): string {
  turnCounter += 1;
  return `turn-${turnCounter}`;
}

/** One rendered candidate card -- never raw JSON, per this story's acceptance criteria. */
function CandidateCard({
  candidate,
  proposal,
  demoSlug,
  canMutate,
}: {
  candidate: HeroCopyCandidate | TemplateSwapCandidate;
  proposal: ProposedOptionsResult;
  demoSlug: string;
  canMutate: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ApplyStatus>({ kind: "idle" });

  function handleApply() {
    const chosen = isHeroCandidate(candidate)
      ? { headline: candidate.headline, ...(candidate.subheadline !== undefined ? { subheadline: candidate.subheadline } : {}) }
      : { templateKey: (candidate as TemplateSwapCandidate).templateKey };

    startTransition(async () => {
      try {
        await applyCopilotOptionAction({
          demoSlug,
          shape: proposal.shape,
          pageType: proposal.pageType,
          slug: proposal.slug,
          chosen,
        });
        setStatus({ kind: "success", detail: "Applied." });
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12, minWidth: 220, flex: "1 1 220px" }}>
      <strong>{candidate.label}</strong>
      {isHeroCandidate(candidate) ? (
        <>
          <p style={{ margin: "6px 0" }}>{candidate.headline}</p>
          {candidate.subheadline ? <p style={{ margin: "6px 0", color: "#666" }}>{candidate.subheadline}</p> : null}
        </>
      ) : (
        <p style={{ margin: "6px 0" }}>
          Layout template: <code>{(candidate as TemplateSwapCandidate).templateKey}</code>
        </p>
      )}

      <button type="button" onClick={handleApply} disabled={!canMutate || isPending || status.kind === "success"}>
        {isPending ? "Applying..." : status.kind === "success" ? "Applied" : "Apply this option"}
      </button>
      {!canMutate ? (
        <p style={{ color: "#900", fontSize: "0.85em" }}>
          Your admin role doesn&apos;t have mutate permission -- applying is disabled for this session.
        </p>
      ) : null}
      {status.kind === "success" ? (
        <p style={{ color: "#060", fontSize: "0.9em" }}>
          Applied. See the <Link href={`/demo/${demoSlug}/admin/content-layout`}>Content &amp; Layout dashboard</Link>.
        </p>
      ) : null}
      {status.kind === "error" ? <p style={{ color: "#900", fontSize: "0.9em" }}>{status.message}</p> : null}
    </div>
  );
}

function ToolCallSummary({ toolCall, demoSlug, canMutate }: { toolCall: RawToolCall; demoSlug: string; canMutate: boolean }) {
  if (toolCall.name === "propose_options" && !toolCall.isError && isProposeOptionsResult(toolCall.result)) {
    const proposal = toolCall.result;
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {proposal.candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            proposal={proposal}
            demoSlug={demoSlug}
            canMutate={canMutate}
          />
        ))}
      </div>
    );
  }

  if (toolCall.name === "apply_option") {
    if (toolCall.isError) {
      const message = (toolCall.result as { error?: string } | undefined)?.error ?? "apply_option was rejected.";
      return (
        <p style={{ color: "#900", marginTop: 8 }}>
          The copilot tried to apply an option directly and it was rejected: {message}
        </p>
      );
    }
    if (isPendingConfirmationResult(toolCall.result)) {
      return <p style={{ color: "#666", marginTop: 8 }}>The copilot previewed an option but did not apply it (no confirm:true).</p>;
    }
    return (
      <p style={{ color: "#060", marginTop: 8 }}>
        The copilot applied a change directly. See the <Link href={`/demo/${demoSlug}/admin/content-layout`}>Content &amp; Layout dashboard</Link>.
      </p>
    );
  }

  return null;
}

export function CopilotChat({ demoSlug, canMutate }: { demoSlug: string; canMutate: boolean }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const requestText = draft.trim();
    if (!requestText || isSubmitting) return;

    const id = nextId();
    setTurns((prev) => [...prev, { id, requestText, status: "pending" }]);
    setDraft("");
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/demo/${demoSlug}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestText }),
      });
      const body = await res.json();
      if (!res.ok) {
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: "error", errorMessage: body?.error ?? `Request failed (${res.status})` } : t)),
        );
      } else {
        setTurns((prev) => (prev.map((t) => (t.id === id ? { ...t, status: "done", response: body } : t))));
      }
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "error", errorMessage: err instanceof Error ? err.message : String(err) } : t)),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        {turns.length === 0 ? (
          <p style={{ color: "#666" }}>
            No messages yet -- try &ldquo;make the home page hero more seasonal&rdquo; or &ldquo;suggest a different layout
            template for the home page&rdquo;.
          </p>
        ) : null}
        {turns.map((turn) => (
          <div key={turn.id} style={{ borderBottom: "1px solid #eee", paddingBottom: 12 }}>
            <p>
              <strong>Admin:</strong> {turn.requestText}
            </p>
            {turn.status === "pending" ? <p style={{ color: "#666" }}>Copilot is thinking...</p> : null}
            {turn.status === "error" ? <p style={{ color: "#900" }}>{turn.errorMessage}</p> : null}
            {turn.status === "done" && turn.response ? (
              <div>
                <p>
                  <strong>Copilot:</strong> {turn.response.finalText || <em>(no text response)</em>}
                </p>
                {turn.response.toolCalls
                  .filter((tc) => tc.name === "propose_options" || tc.name === "apply_option")
                  .map((tc, i) => (
                    <ToolCallSummary key={i} toolCall={tc} demoSlug={demoSlug} canMutate={canMutate} />
                  ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          Describe a content or layout change
          <br />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            style={{ width: "100%", maxWidth: 480 }}
            disabled={isSubmitting}
            placeholder="e.g. make the home page hero more seasonal"
          />
        </label>
        <p>
          <button type="submit" disabled={isSubmitting || !draft.trim()}>
            {isSubmitting ? "Sending..." : "Send"}
          </button>
        </p>
      </form>
    </div>
  );
}
