import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { chatRuns } from "@/db/schema";

export const RUN_STALE_MS = 60_000;

export function recoverStaleRuns(conversationId: string, householdId: string, now = new Date()) {
  const staleBefore = new Date(now.getTime() - RUN_STALE_MS);
  db.update(chatRuns).set({
    status: "interrupted", safeError: "The response was interrupted. You can send another message.",
    finishedAt: now, updatedAt: now,
  }).where(and(
    eq(chatRuns.conversationId, conversationId), eq(chatRuns.householdId, householdId),
    eq(chatRuns.status, "running"), lt(chatRuns.heartbeatAt, staleBefore),
  )).run();
}

export function recentRun(conversationId: string, householdId: string) {
  recoverStaleRuns(conversationId, householdId);
  return db.select().from(chatRuns).where(and(
    eq(chatRuns.conversationId, conversationId), eq(chatRuns.householdId, householdId),
  )).orderBy(desc(chatRuns.updatedAt), desc(chatRuns.id)).get();
}

