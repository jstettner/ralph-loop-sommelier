import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { recommendations } from "@/db/schema";

type RecommendationIdentity = {
  wineName: string;
  producer: string | null | undefined;
};

type RecommendationVisibility = RecommendationIdentity & {
  status: "suggested" | "purchased" | "tasted" | "dismissed";
};

const visibleStatuses = ["suggested", "purchased"] as const;

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

export function recommendationIdentity(recommendation: RecommendationIdentity): string {
  return `${normalizeIdentityPart(recommendation.wineName)}\u0000${normalizeIdentityPart(recommendation.producer)}`;
}

export function isVisibleRecommendation(status: RecommendationVisibility["status"]): boolean {
  return status === "suggested" || status === "purchased";
}

export function deduplicateVisibleRecommendations<T extends RecommendationVisibility>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isVisibleRecommendation(item.status)) return true;
    const identity = recommendationIdentity(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function listVisibleRecommendations(householdId: string) {
  const rows = db.select().from(recommendations).where(and(
    eq(recommendations.householdId, householdId),
    inArray(recommendations.status, visibleStatuses),
  )).orderBy(desc(recommendations.createdAt)).all();
  return deduplicateVisibleRecommendations(rows);
}

export function findVisibleRecommendation(
  householdId: string,
  identity: RecommendationIdentity,
  excludingId?: string,
) {
  const expected = recommendationIdentity(identity);
  return listVisibleRecommendations(householdId).find((item) => (
    item.id !== excludingId && recommendationIdentity(item) === expected
  ));
}
