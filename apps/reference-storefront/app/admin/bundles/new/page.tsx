import Link from "next/link";
import { createBundleAction } from "../../../../lib/actions";
import { BundleFormFields } from "../BundleFormFields";

export const dynamic = "force-dynamic";

export default function NewBundlePage() {
  return (
    <main>
      <p>
        <Link href="/admin/bundles">← Bundles</Link>
      </p>
      <h1>Admin: New bundle</h1>
      <form action={createBundleAction}>
        <BundleFormFields />
        <p>
          <button type="submit">Create bundle</button>
        </p>
      </form>
    </main>
  );
}
