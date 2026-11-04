import Link from "next/link";
import { notFound } from "next/navigation";
import { computeGoalStatus } from "@mercatus-liber/community-goals";
import { isDemoSlug } from "../../../../../lib/demos";
import { createGoalAction, disableGoalAction, enableGoalAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

/**
 * Minimal admin CRUD for @mercatus-liber/community-goals -- same plain-
 * table-plus-form level of polish as the bundles admin page it's modeled
 * on. Deliberately NOT the liquid-fill/progress-bar visual (see that
 * package's own doc comment) -- this page exists so an operator can create
 * a goal, see its real vote count/progress as plain numbers, and toggle it
 * on/off; a storefront's own design-system work renders the actual
 * customer-facing meter elsewhere, reading the same GoalsService data.
 */
export default async function AdminCommunityGoalsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { goals } = await getServicesForDemo(demoSlug);
  const allGoals = await goals.listGoals({ demoSlug });

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Community Goals</h1>
      <p style={{ color: "#666" }}>
        Vote-threshold-gated feature unlocks (e.g. &quot;1000 votes unlocks the live print stream&quot;). A storefront&apos;s own
        progress-bar/liquid-fill UI reads this same vote count and the thresholds below -- this page only manages the data.
      </p>

      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Title</th>
            <th>Votes</th>
            <th>Target</th>
            <th>Bonus</th>
            <th>Status</th>
            <th>Enabled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {allGoals.map((goal) => {
            const { status } = computeGoalStatus(goal);
            return (
              <tr key={goal.id}>
                <td>{goal.slug}</td>
                <td>{goal.title}</td>
                <td>{goal.voteCount}</td>
                <td>{goal.targetCount}</td>
                <td>{goal.bonusCount ?? "—"}</td>
                <td>{status}</td>
                <td>{goal.enabled ? "yes" : "no"}</td>
                <td>
                  <form action={goal.enabled ? disableGoalAction : enableGoalAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="id" value={goal.id} />
                    <button type="submit">{goal.enabled ? "Disable" : "Enable"}</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>New goal</h2>
      <form action={createGoalAction} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <label>
          Slug
          <input type="text" name="slug" required />
        </label>
        <label>
          Title
          <input type="text" name="title" required />
        </label>
        <label>
          Description
          <textarea name="description" />
        </label>
        <label>
          Target votes (unlocks the feature)
          <input type="number" name="targetCount" min={1} required />
        </label>
        <label>
          Bonus votes (optional second, higher threshold)
          <input type="number" name="bonusCount" min={1} />
        </label>
        <button type="submit">Create goal</button>
      </form>
    </main>
  );
}
