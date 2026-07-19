import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { chatRuns, conversations, messages, profiles } from "@/db/schema";
import { getDefaultModel, getModel, ModelUnavailableError } from "@/lib/llm/registry";
import { listProfiles } from "@/server/profiles";
import { getHouseholdSession } from "@/server/session";

const createSchema = z.object({ participantIds: z.array(z.string().uuid()).min(1), model: z.string().min(1).optional() });
const cursorSchema = z.object({ updatedAt: z.number().int().nonnegative(), id: z.string().uuid() });

function cursorEncode(row: { updatedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ updatedAt: row.updatedAt.getTime(), id: row.id })).toString("base64url");
}

function cursorDecode(value: string | null) {
  if (!value) return null;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); } catch { return undefined; }
}

function safePreview(parts: Array<{ type: string; [key: string]: unknown }> | undefined) {
  if (!parts) return "No messages yet";
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      const text = part.text.replace(/\s+/gu, " ").trim();
      if (text) return text.length > 100 ? `${text.slice(0, 99)}…` : text;
    }
  }
  return "Activity recorded";
}

export async function GET(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitValue = url.searchParams.get("limit") ?? "25";
  if (!/^\d+$/u.test(limitValue)) return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
  const limit = Number(limitValue);
  if (limit < 1 || limit > 50) return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
  const cursor = cursorDecode(url.searchParams.get("cursor"));
  if (cursor === undefined) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  const conditions: SQL[] = [eq(conversations.householdId, session.user.id)];
  if (q) {
    const pattern = `%${q.toLocaleLowerCase("en-US").replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(sql`lower(${conversations.title}) like ${pattern} escape '\\'`);
  }
  if (cursor) conditions.push(or(
    lt(conversations.updatedAt, new Date(cursor.updatedAt)),
    and(eq(conversations.updatedAt, new Date(cursor.updatedAt)), lt(conversations.id, cursor.id)),
  ) as SQL);
  const rows = db.select().from(conversations).where(and(...conditions)).orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(limit + 1).all();
  const page = rows.slice(0, limit);
  const householdProfiles = db.select().from(profiles).where(eq(profiles.householdId, session.user.id)).all();
  const summaries = page.map((conversation) => {
    const newestMessage = db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt), desc(messages.id)).get();
    const active = db.select({ id: chatRuns.id }).from(chatRuns).where(and(eq(chatRuns.conversationId, conversation.id), eq(chatRuns.status, "running"))).get();
    return {
      id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt,
      participants: householdProfiles.filter((profile) => conversation.participantIds.includes(profile.id)).map(({ id, name, color }) => ({ id, name, color })),
      preview: safePreview(newestMessage?.parts), status: active ? "running" as const : "idle" as const,
    };
  });
  return NextResponse.json({ conversations: summaries, nextCursor: rows.length > limit && page.length ? cursorEncode(page[page.length - 1] as typeof conversations.$inferSelect) : null });
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
  const conversation = { id: crypto.randomUUID(), householdId: session.user.id, participantIds: parsed.data.participantIds, title: "New tasting session", model };
  db.insert(conversations).values(conversation).run();
  return NextResponse.json({ conversation }, { status: 201 });
}
