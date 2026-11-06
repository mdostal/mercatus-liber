import Link from "next/link";
import { notFound } from "next/navigation";
import { savePricingRatesAction } from "../../../../../lib/actions";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

function RateRow({ label, name, value }: { label: string; name: string; value: number }) {
  return (
    <tr>
      <td>
        <label htmlFor={name}>{label}</label>
      </td>
      <td>
        <input id={name} name={name} type="number" step={1} defaultValue={value} />
      </td>
    </tr>
  );
}

/** Edit what each customization costs. The same plain table-and-form level as the other admin pages. All amounts are in cents. */
export default async function AdminCustomizationPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { customization, pricing, catalog } = await getServicesForDemo(demoSlug);
  const [products, palette, finishes] = await Promise.all([customization.listProductCustomizations(), customization.listPalette(), customization.listFinishTiers()]);

  const rows = await Promise.all(
    products.map(async (config) => ({ config, product: await catalog.getProduct(config.productId), rules: await pricing.getRules(config.productId) })),
  );

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Customization</h1>
      <p style={{ color: "#666" }}>What each choice costs, in cents. Changes apply to the next price a shopper sees. Items already in a cart keep their price.</p>
      {rows.length === 0 && <p>No customizable products in this store.</p>}
      {rows.map(({ config, product, rules }) =>
        rules && product ? (
          <section key={config.id}>
            <h2>{product.title}</h2>
            <form action={savePricingRatesAction}>
              <input type="hidden" name="demoSlug" value={demoSlug} />
              <input type="hidden" name="productId" value={config.productId} />
              <table>
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Cents</th>
                  </tr>
                </thead>
                <tbody>
                  {config.finishIds.map((id) => (
                    <RateRow key={id} label={`Base: ${finishes.find((f) => f.id === id)?.label ?? id}`} name={`base:${id}`} value={rules.basePriceCents[id] ?? 0} />
                  ))}
                  {rules.attributes
                    .filter((a) => !a.quoteOnly)
                    .map((a) => (
                      <RateRow key={a.id} label={a.label} name={`attr:${a.id}`} value={a.perUnitCents} />
                    ))}
                  {palette.map((color) => (
                    <RateRow key={color.id} label={`Color markup: ${color.label}`} name={`markup:${color.id}`} value={rules.colorMarkupCents?.[color.id] ?? 0} />
                  ))}
                </tbody>
              </table>
              <button type="submit">Save prices</button>
            </form>
          </section>
        ) : null,
      )}
    </main>
  );
}
