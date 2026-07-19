import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import { getDefaultModel, getModel, ModelUnavailableError } from "@/lib/llm/registry";
import { listProfiles } from "@/server/profiles";
import { getHouseholdSession } from "@/server/session";

const createSchema = z.object({ participantIds: z.array(z.string().uuid()).min(1), model: z.string().min(1).optional() });

export async function GET(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db.select().from(conversations).where(eq(conversations.householdId, session.user.id)).orderBy(desc(conversations.updatedAt)).all();
  return NextResponse.json({ conversations: rows });
}

export async function POST(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose at least one valid participant." }, { status: 400 });
  if (new Set(parsed.data.participantIds).size !== parsed.data.participantIds.length) return NextResponse.json({ error: "Participants must be unique." }, { status: 400 });
  const householdIds = new Set(listProfiles(session.user.id).map((profile) => profile.id));
  if (parsed.data.participantIds.some((id) => !householdIds.has(id))) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  const model = parsed.data.model ?? getDefaultModel();
  try { getModel(model); } catch (error) {
    if (error instanceof ModelUnavailableError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const conversation = {
    id: crypto.randomUUID(), householdId: session.user.id, participantIds: parsed.data.participantIds,
    title: "New tasting session", model,
  };
  db.insert(conversations).values(conversation).run();
  return NextResponse.json({ conversation }, { status: 201 });
}
