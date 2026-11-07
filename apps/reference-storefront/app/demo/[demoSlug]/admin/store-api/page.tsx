import Link from "next/link";
import { notFound } from "next/navigation";
import { STORE_API_SCOPES } from "@mercatus-liber/store-api";
import { revokeStoreApiKeyAction } from "../../../../../lib/actions";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";
import { canonicalUrl } from "../../../../../lib/site-url";
import { CreateKeyForm } from "./CreateKeyForm";

export const dynamic = "force-dynamic";

/** API keys for outside apps, such as flayr, to read this store and run its promotions. */
export default async function AdminStoreApiPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { storeApiKeys } = await getServicesForDemo(demoSlug);
  const keys = await storeApiKeys.list();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Store API</h1>
      <p style={{ color: "#666" }}>
        Keys let an outside app, such as flayr, read this store&apos;s products and run its promotions. The API is at <code>{canonicalUrl(`/api/store/v1/${demoSlug}`)}</code>.
      </p>
      <CreateKeyForm demoSlug={demoSlug} scopes={[...STORE_API_SCOPES]} />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Key starts</th>
            <th>Scopes</th>
            <th>Created</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>{key.name}</td>
              <td>
                <code>mlsk_{key.prefix}_…</code>
              </td>
              <td>{key.scopes.join(", ")}</td>
              <td>{key.createdAt.slice(0, 10)}</td>
              <td>{key.revokedAt ? `Revoked ${key.revokedAt.slice(0, 10)}` : "Active"}</td>
              <td>
                {!key.revokedAt && (
                  <form action={revokeStoreApiKeyAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="keyId" value={key.id} />
                    <button type="submit">Revoke</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
