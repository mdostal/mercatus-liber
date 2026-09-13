import type { CatalogService } from "@mercatus-liber/catalog";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { publishReviewAction, rejectReviewAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

/** productId -> "Title (/products/slug)" for real product-name display in the moderation queue -- returns the raw id itself for a deleted/unknown product rather than throwing. */
async function resolveProductLabel(catalog: CatalogService, productId: string): Promise<{ title: string; slug: string | null }> {
  const product = await catalog.getProduct(productId);
  return product ? { title: product.title, slug: product.slug } : { title: productId, slug: null };
}

export const dynamic = "force-dynamic";

/** "★★★★★"-style rendering of a 1-5 rating -- real computed stars, no fractional/half-star fabrication (a review's rating is always a whole number, see Review.rating's own type). */
function ratingStars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default async function AdminReviewsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { reviews, catalog } = await getServicesForDemo(demoSlug);
  // No filter -- the admin queue shows every status (pending/published/rejected) so an
  // admin can see the full moderation history, not just what's still awaiting action.
  const allReviews = await reviews.listAllForModeration();
  const productLabels = new Map<string, { title: string; slug: string | null }>();
  for (const productId of new Set(allReviews.map((r) => r.productId))) {
    productLabels.set(productId, await resolveProductLabel(catalog, productId));
  }

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Reviews</h1>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Rating</th>
            <th>Author</th>
            <th>Title</th>
            <th>Status</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {allReviews.map((review) => {
            const label = productLabels.get(review.productId)!;
            return (
            <tr key={review.id}>
              <td>
                {label.slug ? (
                  <Link href={`/demo/${demoSlug}/products/${label.slug}`}>{label.title}</Link>
                ) : (
                  label.title
                )}
              </td>
              <td>
                {ratingStars(review.rating)} {review.rating}/5
              </td>
              <td>{review.authorName}</td>
              <td>{review.title}</td>
              <td>{review.status}</td>
              <td>
                {review.status !== "published" ? (
                  <form action={publishReviewAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="id" value={review.id} />
                    <button type="submit">Publish</button>
                  </form>
                ) : null}
              </td>
              <td>
                {review.status !== "rejected" ? (
                  <form action={rejectReviewAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="id" value={review.id} />
                    <button type="submit">Reject</button>
                  </form>
                ) : null}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
