import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { recommendations } from "@/db/schema";
import { findVisibleRecommendation, isVisibleRecommendation } from "@/server/recommendations";
import { getHouseholdSession } from "@/server/session";

const schema = z.object({ status: z.enum(["suggested", "purchased", "tasted", "dismissed"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const recommendation = db.select().from(recommendations).where(and(eq(recommendations.id, id), eq(recommendations.householdId, session.user.id))).get();
  if (!recommendation) return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid recommendation status." }, { status: 400 });
  if (isVisibleRecommendation(parsed.data.status)) {
    const duplicate = findVisibleRecommendation(session.user.id, recommendation, recommendation.id);
    if (duplicate) return NextResponse.json({ error: "That wine is already in your recommendations." }, { status: 409 });
  }
  db.update(recommendations).set({ status: parsed.data.status }).where(and(eq(recommendations.id, id), eq(recommendations.householdId, session.user.id))).run();
  return NextResponse.json({ recommendation: { ...recommendation, status: parsed.data.status } });
}
