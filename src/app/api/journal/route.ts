import { NextResponse } from "next/server";
import { z } from "zod";
import { listJournal } from "@/server/journal";
import { getHouseholdSession } from "@/server/session";

const filtersSchema = z.object({
  taster: z.string().uuid().optional(), verdict: z.enum(["liked", "mixed", "disliked"]).optional(),
  style: z.enum(["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"]).optional(),
});

export async function GET(request: Request) {
  const session = await getHouseholdSession(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const parsed = filtersSchema.safeParse({
    taster: url.searchParams.get("taster") || undefined,
    verdict: url.searchParams.get("verdict") || undefined,
    style: url.searchParams.get("style") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid journal filter." }, { status: 400 });
  return NextResponse.json({ notes: listJournal(session.user.id, {
    profileId: parsed.data.taster, verdict: parsed.data.verdict, style: parsed.data.style,
  }) });
}
