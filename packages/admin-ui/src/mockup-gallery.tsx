"use client";

import { useEffect, useRef, useState, useTransition } from "react";

export interface MockupImage {
  /** Unique within one set of results. */
  key: string;
  url: string;
  label: string;
}

export type MockupRequestResult = { ok: true; taskId: string } | { ok: false; error: string; retryAfterSeconds?: number };
export type MockupPollResult = { status: "pending" } | { status: "completed"; images: MockupImage[] } | { status: "failed"; error: string };
export type MockupSaveResult = { ok: true; message: string } | { ok: false; error: string };

export interface MockupGalleryProps {
  /** What can be mocked up, e.g. one per colour. */
  variants: { id: string; label: string; swatch?: string }[];
  /** Images already on the product, shown first. */
  current?: { url: string; alt: string }[];
  /** Most variants per request. Default 6. */
  maxPerRequest?: number;
  /** Seconds between status checks. Default 3. */
  pollSeconds?: number;
  /** Gives up waiting after this many checks. Default 40. */
  maxPolls?: number;
  onRequest: (variantIds: string[]) => Promise<MockupRequestResult>;
  onPoll: (taskId: string) => Promise<MockupPollResult>;
  /** Keeps the chosen images as the product's images, in the order chosen. */
  onSave: (images: MockupImage[]) => Promise<MockupSaveResult>;
}

const button = { fontFamily: "inherit", fontWeight: 600, padding: "6px 12px", borderRadius: 6, borderWidth: "2px", borderStyle: "solid", borderColor: "var(--color-text, #111)", background: "var(--color-surface, #fff)", color: "var(--color-text, #111)", cursor: "pointer" } as const;

/**
 * Ask a provider for mockups of chosen variants, wait for them, and keep the
 * best as the product's images. Providers limit how often mockups can be
 * requested (Printful: 2 a minute for a new store), so a refused request
 * says when to try again.
 */
export function MockupGallery({ variants, current = [], maxPerRequest = 6, pollSeconds = 3, maxPolls = 40, onRequest, onPoll, onSave }: MockupGalleryProps) {
  const [chosenVariants, setChosenVariants] = useState<string[]>(variants.slice(0, 1).map((v) => v.id));
  const [images, setImages] = useState<MockupImage[]>([]);
  const [keep, setKeep] = useState<string[]>([]);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [pending, startTransition] = useTransition();
  const cancelled = useRef(false);
  useEffect(() => {
    // Reset on every mount: StrictMode mounts, unmounts and mounts again in development.
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const request = () =>
    startTransition(async () => {
      setStatus(null);
      const result = await onRequest(chosenVariants);
      if (!result.ok) {
        setStatus({ error: true, text: result.retryAfterSeconds ? `${result.error} Try again in ${result.retryAfterSeconds} s.` : result.error });
        return;
      }
      setWaiting(true);
      setStatus({ error: false, text: "Printful is making the mockups…" });
      for (let i = 0; i < maxPolls && !cancelled.current; i++) {
        await new Promise((r) => setTimeout(r, pollSeconds * 1000));
        const poll = await onPoll(result.taskId);
        if (poll.status === "pending") continue;
        setWaiting(false);
        if (poll.status === "failed") {
          setStatus({ error: true, text: poll.error });
          return;
        }
        setImages((prev) => [...prev, ...poll.images.filter((img) => !prev.some((p) => p.key === img.key))]);
        setStatus({ error: false, text: `${poll.images.length} mockup${poll.images.length === 1 ? "" : "s"} ready. Tick the ones to keep.` });
        return;
      }
      setWaiting(false);
      setStatus({ error: true, text: "Printful is taking longer than usual. Try again in a minute." });
    });

  const save = () =>
    startTransition(async () => {
      const chosen = keep.map((k) => images.find((i) => i.key === k)!).filter(Boolean);
      const result = await onSave(chosen);
      setStatus(result.ok ? { error: false, text: result.message } : { error: true, text: result.error });
      if (result.ok) setKeep([]);
    });

  return (
    <section aria-label="Mockups" style={{ display: "grid", gap: 12 }}>
      {current.length > 0 && (
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Product images now</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {current.map((img) => (
              <img key={img.url} src={img.url} alt={img.alt} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6, borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)" }} />
            ))}
          </div>
        </div>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Mock up ({chosenVariants.length} of at most {maxPerRequest})
        </legend>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {variants.map((v) => {
            const on = chosenVariants.includes(v.id);
            return (
              <label key={v.id} data-variant={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "3px 7px", borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 6 }}>
                <input type="checkbox" checked={on} disabled={!on && chosenVariants.length >= maxPerRequest} onChange={() => setChosenVariants(on ? chosenVariants.filter((x) => x !== v.id) : [...chosenVariants, v.id])} />
                {v.swatch && <span aria-hidden style={{ width: 11, height: 11, borderRadius: "50%", background: v.swatch, borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)" }} />}
                {v.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={button} disabled={pending || waiting || chosenVariants.length === 0} onClick={request}>
          {waiting ? "Waiting for Printful…" : "Make mockups"}
        </button>
        <button type="button" style={button} disabled={pending || keep.length === 0} onClick={save}>
          Keep {keep.length || ""} as product images
        </button>
      </div>
      {status && (
        <p role={status.error ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color: status.error ? "var(--color-danger, #b42318)" : "inherit" }}>
          {status.text}
        </p>
      )}
      {images.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))" }}>
          {images.map((img) => {
            const order = keep.indexOf(img.key);
            return (
              <li key={img.key} data-mockup={img.key}>
                <label style={{ display: "grid", gap: 4, fontSize: 12, cursor: "pointer" }}>
                  <img src={img.url} alt={img.label} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, outlineStyle: "solid", outlineWidth: order >= 0 ? "3px" : "1px", outlineColor: order >= 0 ? "var(--color-primary, #333)" : "var(--color-border, #ccc)" }} />
                  <span>
                    <input type="checkbox" checked={order >= 0} onChange={() => setKeep(order >= 0 ? keep.filter((k) => k !== img.key) : [...keep, img.key])} /> {img.label}
                    {order >= 0 ? ` (#${order + 1})` : ""}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
