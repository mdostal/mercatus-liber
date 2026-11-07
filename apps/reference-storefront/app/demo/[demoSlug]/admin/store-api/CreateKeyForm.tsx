"use client";

import { useActionState } from "react";
import { createStoreApiKeyAction, type CreateStoreApiKeyResult } from "../../../../../lib/actions";

/** Creates a key and shows it once: only its hash is stored, so it can't be shown again. */
export function CreateKeyForm({ demoSlug, scopes }: { demoSlug: string; scopes: string[] }) {
  const [result, action, pending] = useActionState<CreateStoreApiKeyResult | null, FormData>(createStoreApiKeyAction, null);
  return (
    <form action={action} style={{ display: "grid", gap: 8, maxWidth: 520, margin: "16px 0" }}>
      <input type="hidden" name="demoSlug" value={demoSlug} />
      <label>
        Name <input name="name" required placeholder="flayr" />
      </label>
      <fieldset>
        <legend>Scopes</legend>
        {scopes.map((scope) => (
          <label key={scope} style={{ display: "block" }}>
            <input type="checkbox" name="scopes" value={scope} defaultChecked={scope.endsWith(":read")} /> {scope}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create key"}
      </button>
      {result?.ok === false && <p role="alert">{result.error}</p>}
      {result?.ok && (
        <p role="status">
          Copy this key now. It won&apos;t be shown again: <code style={{ wordBreak: "break-all" }}>{result.secret}</code>
        </p>
      )}
    </form>
  );
}
