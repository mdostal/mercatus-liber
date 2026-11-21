"use client";

import { useEffect, useRef, useState } from "react";

/** "2d 4h", "4h 05m", "5m 09s", "9s"; "0s" at or past zero. Two units, largest first. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

/** e.g. "Mon, Nov 30, 12:00 PM CST" in the given time zone. */
export function formatWhen(iso: string, options: { timeZone?: string; locale?: string } = {}): string {
  return new Intl.DateTimeFormat(options.locale ?? "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: options.timeZone ?? "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export interface CountdownProps {
  /** The moment counted down to (ISO 8601). */
  to: string;
  /**
   * "Now" as the server saw it when rendering (ISO 8601). The first render,
   * on the server and in the browser, uses it so the two match; the browser
   * then ticks on its own clock.
   */
  now: string;
  /** Before the time, e.g. "Opens in". */
  label?: string;
  /** Shown at zero instead of the time, e.g. "Open now". */
  doneLabel?: string;
  /** Called once when the countdown reaches zero, e.g. to refresh the page. */
  onReach?: () => void;
}

/** Time left until `to`, ticking every second. Renders inside a `<time>` element. */
export function Countdown({ to, now, label, doneLabel, onReach }: CountdownProps) {
  const target = Date.parse(to);
  const [current, setCurrent] = useState(() => Date.parse(now));
  const reached = useRef(false);
  useEffect(() => {
    setCurrent(Date.now());
    const timer = setInterval(() => setCurrent(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = target - current;
  useEffect(() => {
    if (left <= 0 && !reached.current) {
      reached.current = true;
      onReach?.();
    }
  }, [left, onReach]);
  return (
    <span data-countdown style={{ fontVariantNumeric: "tabular-nums" }}>
      {left <= 0 && doneLabel ? (
        doneLabel
      ) : (
        <>
          {label ? `${label} ` : ""}
          <time dateTime={to}>{formatRemaining(left)}</time>
        </>
      )}
    </span>
  );
}

export interface SaleWindowProps {
  /** From lifecycle() in @mercatus-liber/core. */
  lifecycle: { state: "upcoming" | "active" | "ended" | "inactive"; startsAt: string | null; endsAt: string | null };
  /** "Now" as the server saw it (ISO 8601); see Countdown. */
  now: string;
  /** Time zone for dates, e.g. "America/Chicago". Default UTC. */
  timeZone?: string;
  locale?: string;
  /** Called when the window opens or closes, e.g. to refresh the page. */
  onChange?: () => void;
  /** Words, if the defaults don't suit. */
  labels?: { opensIn?: string; endsIn?: string; ended?: string; opensAt?: string; endsAt?: string };
}

/**
 * Where something is in its sale window, as a small badge: "Opens in 2d 4h"
 * with the date before it opens, "Ends in 5h 12m" while on sale (nothing if
 * it has no end), "Ended" with the date after. Nothing for inactive items.
 */
export function SaleWindow({ lifecycle, now, timeZone, locale, onChange, labels = {} }: SaleWindowProps) {
  const when = (iso: string) => formatWhen(iso, { ...(timeZone ? { timeZone } : {}), ...(locale ? { locale } : {}) });
  const badge = { display: "inline-flex", flexWrap: "wrap", gap: "0.4em", alignItems: "baseline", fontSize: "0.9em", padding: "0.25em 0.6em", borderRadius: 6, background: "var(--color-surface, #f4f4f4)", color: "var(--color-text, #111)" } as const;
  if (lifecycle.state === "upcoming" && lifecycle.startsAt) {
    return (
      <p data-sale-window="upcoming" style={badge}>
        <b>
          <Countdown to={lifecycle.startsAt} now={now} label={labels.opensIn ?? "Opens in"} doneLabel="Open now" {...(onChange ? { onReach: onChange } : {})} />
        </b>
        <span>
          {labels.opensAt ?? "Opens"} {when(lifecycle.startsAt)}
        </span>
      </p>
    );
  }
  if (lifecycle.state === "active" && lifecycle.endsAt) {
    return (
      <p data-sale-window="active" style={badge}>
        <b>
          <Countdown to={lifecycle.endsAt} now={now} label={labels.endsIn ?? "Ends in"} doneLabel={labels.ended ?? "Ended"} {...(onChange ? { onReach: onChange } : {})} />
        </b>
        <span>
          {labels.endsAt ?? "Until"} {when(lifecycle.endsAt)}
        </span>
      </p>
    );
  }
  if (lifecycle.state === "ended") {
    return (
      <p data-sale-window="ended" style={{ ...badge, color: "var(--color-text-muted, #555)" }}>
        <b>{labels.ended ?? "Ended"}</b>
        {lifecycle.endsAt ? <span>{when(lifecycle.endsAt)}</span> : null}
      </p>
    );
  }
  return null;
}
