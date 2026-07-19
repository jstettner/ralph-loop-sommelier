import type { Profile } from "@/db/schema";

// A safe, validated view of an AI SDK tool part. Friendly summaries are derived only from these
// fields — never raw JSON, ids, or provider payloads (specs/04).
export type ToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
};

export type SourceLink = { title?: string; url?: string };

export function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

export function toolName(part: ToolPart): string {
  if (part.type === "dynamic-tool") return part.toolName ?? "tool";
  return part.type.slice("tool-".length);
}

export const LABELS: Record<string, string> = {
  record_tasting_note: "Recording tasting note",
  update_palate_profile: "Updating palate profile",
  save_recommendation: "Saving recommendation",
  search_web: "Searching the web",
  search_wine_availability: "Finding where to buy",
};

export const LABELS_DONE: Record<string, string> = {
  record_tasting_note: "Recorded tasting note",
  update_palate_profile: "Updated palate profile",
  save_recommendation: "Saved recommendation",
  search_web: "Searched the web",
  search_wine_availability: "Availability results",
};

export function nameFor(participants: Profile[], id: unknown): string | null {
  return typeof id === "string" ? participants.find((profile) => profile.id === id)?.name ?? null : null;
}

// Concise, safe summary from the (possibly partial) validated tool input — no ids, no JSON.
export function toolDetail(name: string, input: Record<string, unknown> | undefined, participants: Profile[]): string {
  if (!input) return "";
  if (name === "record_tasting_note") {
    const wine = (input.wine as { name?: string } | undefined)?.name;
    return [wine, nameFor(participants, input.taster_profile_id)].filter(Boolean).join(" · ");
  }
  if (name === "update_palate_profile") return nameFor(participants, input.taster_profile_id) ?? "";
  if (name === "save_recommendation") {
    const target = input.for_profile_id === null ? "the table" : nameFor(participants, input.for_profile_id);
    return [input.wine_name as string | undefined, target].filter(Boolean).join(" · ");
  }
  if (name === "search_web" || name === "search_wine_availability") return (input.query as string | undefined) ?? "";
  return "";
}

export function toolStatus(part: ToolPart): "running" | "completed" | "failed" {
  return part.state === "output-error" ? "failed" : part.state === "output-available" ? "completed" : "running";
}

export function toolLabel(part: ToolPart): string {
  const name = toolName(part);
  const status = toolStatus(part);
  if (name === "save_recommendation" && status === "completed" && part.output?.duplicate === true && part.output.retry === true) {
    return "Recommendation already queued — choosing another";
  }
  return (status === "completed" ? LABELS_DONE[name] : LABELS[name]) ?? name.replaceAll("_", " ");
}

export function sourcesFrom(part: ToolPart): SourceLink[] {
  const raw = part.state === "output-available" ? (part.output?.sources as SourceLink[] | undefined) : undefined;
  return Array.isArray(raw) ? raw.filter((source) => typeof source.url === "string") : [];
}
