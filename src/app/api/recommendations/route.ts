import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { recommendations } from "@/db/schema";
import { getActiveProfileFromRequest, getHouseholdSession } from "@/server/session";

const targetSchema = z.enum(["active", "joint", "all"]);

export async function GET(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const target = targetSchema.safeParse(new URL(request.url).searchParams.get("target") ?? "all");
  if (!target.success) return NextResponse.json({ error: "Invalid recommendation target." }, { status: 400 });
  const base = eq(recommendations.householdId, session.user.id);
  if (target.data === "active") {
    const active = getActiveProfileFromRequest(session, request);
    if (!active) return NextResponse.json({ error: "Active profile required." }, { status: 409 });
    return NextResponse.json({ recommendations: db.select().from(recommendations).where(and(base, eq(recommendations.profileId, active.id))).orderBy(desc(recommendations.createdAt)).all() });
  }
  const condition = target.data === "joint" ? and(base, isNull(recommendations.profileId)) : base;
  return NextResponse.json({ recommendations: db.select().from(recommendations).where(condition).orderBy(desc(recommendations.createdAt)).all() });
}
