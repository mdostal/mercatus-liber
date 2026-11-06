import type { LineCustomization } from "@mercatus-liber/core";

/** A one-line summary of a customized line for a cart or order page. Ids are shown as stored, since the line is a snapshot. */
export function describeCustomization(line: LineCustomization): string {
  const parts = [`Finish: ${line.finish}`];
  if (line.name) parts.push(`Name: ${line.name}`);
  for (const [option, choice] of Object.entries(line.picks ?? {})) parts.push(`${option}: ${choice}`);
  const colors = [...new Set(Object.values(line.colors))];
  if (colors.length > 0) parts.push(`Colors: ${colors.join(", ")}`);
  if (line.requests?.length) parts.push(`By request: ${line.requests.map((r) => r.id).join(", ")}`);
  return parts.join(" · ");
}
