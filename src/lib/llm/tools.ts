import { and, eq, isNull } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db/client";
import { conversations, palateProfiles, profiles, recommendations, tastingNotes, wines } from "@/db/schema";
import { getSearchProvider, toSearchSources } from "@/lib/search";

const styleSchema = z.enum(["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"]);
const priceBandSchema = z.enum(["under_15", "15_30", "30_60", "over_60"]);
const dimensionSchema = z.number().int().min(1).max(5);

export const recordTastingNoteSchema = z.object({
  taster_profile_id: z.string().uuid(),
  wine: z.object({
    name: z.string().min(1), producer: z.string().min(1).optional(), vintage: z.number().int().min(1800).max(2200).optional(),
    grapes: z.array(z.string().min(1)), region: z.string().optional(), country: z.string().optional(),
    style: styleSchema, price_band: priceBandSchema.optional(),
  }),
  note: z.object({
    appearance: z.string().optional(), nose: z.array(z.string()),
    palate: z.object({ sweetness: dimensionSchema.nullable(), acidity: dimensionSchema.nullable(), tannin: dimensionSchema.nullable(), alcohol: dimensionSchema.nullable(), body: dimensionSchema.nullable(), flavors: z.array(z.string()) }),
    finish: z.string().optional(), rating: dimensionSchema.optional(), verdict: z.enum(["liked", "mixed", "disliked"]), freeform: z.string().optional(),
  }),
});

export const updatePalateProfileSchema = z.object({
  taster_profile_id: z.string().uuid(), sweetness: dimensionSchema.optional(), acidity: dimensionSchema.optional(),
  tannin: dimensionSchema.optional(), body: dimensionSchema.optional(), oak: dimensionSchema.optional(),
  adventurousness: dimensionSchema.optional(), notes: z.string().min(1).optional(),
});

export const saveRecommendationSchema = z.object({
  for_profile_id: z.string().uuid().nullable(), wine_name: z.string().min(1), producer: z.string().optional(),
  grape: z.string().optional(), region: z.string().optional(), style: styleSchema.optional(), price_band: priceBandSchema.optional(),
  reasoning: z.string().min(1),
});

export const searchAvailabilitySchema = z.object({ query: z.string().min(1), location: z.string().min(1).optional() });

export type ToolContext = { conversationId?: string; householdId: string; participantIds: string[]; recommendationSource?: "chat" | "dashboard" };

function validateContext(context: ToolContext, attributedProfile?: string | null): void {
  if (context.conversationId) {
    const conversation = db.select().from(conversations).where(and(
      eq(conversations.id, context.conversationId), eq(conversations.householdId, context.householdId),
    )).get();
    if (!conversation) throw new Error("Conversation not found for this household.");
    if (conversation.participantIds.some((id) => !context.participantIds.includes(id)) || context.participantIds.some((id) => !conversation.participantIds.includes(id))) {
      throw new Error("Conversation participant context does not match.");
    }
  } else {
    const householdProfiles = db.select({ id: profiles.id }).from(profiles).where(eq(profiles.householdId, context.householdId)).all();
    const validIds = new Set(householdProfiles.map((profile) => profile.id));
    if (context.participantIds.some((id) => !validIds.has(id))) throw new Error("Participant not found for this household.");
  }
  if (attributedProfile && !context.participantIds.includes(attributedProfile)) throw new Error("The attributed profile is not a conversation participant.");
}

export function createChatTools(context: ToolContext) {
  return {
    record_tasting_note: tool({
      description: "Record one structured tasting note for one participating taster.", inputSchema: recordTastingNoteSchema,
      execute: async (input) => {
        validateContext(context, input.taster_profile_id);
        const predicates = [eq(wines.name, input.wine.name), input.wine.producer ? eq(wines.producer, input.wine.producer) : isNull(wines.producer), input.wine.vintage ? eq(wines.vintage, input.wine.vintage) : isNull(wines.vintage)];
        let wine = db.select().from(wines).where(and(...predicates)).get();
        if (!wine) {
          const id = crypto.randomUUID();
          db.insert(wines).values({ id, ...input.wine }).run();
          wine = db.select().from(wines).where(eq(wines.id, id)).get();
        }
        if (!wine) throw new Error("Wine could not be saved.");
        const noteId = crypto.randomUUID();
        db.insert(tastingNotes).values({
          id: noteId, householdId: context.householdId, profileId: input.taster_profile_id,
          wineId: wine.id, conversationId: context.conversationId, ...input.note,
        }).run();
        return { saved: true, tasting_note_id: noteId, wine_id: wine.id };
      },
    }),
    update_palate_profile: tool({
      description: "Merge durable preference evidence into one participating taster's palate.", inputSchema: updatePalateProfileSchema,
      execute: async (input) => {
        validateContext(context, input.taster_profile_id);
        const current = db.select().from(palateProfiles).where(eq(palateProfiles.profileId, input.taster_profile_id)).get();
        if (!current) throw new Error("Palate profile not found.");
        const appended = input.notes
          ? [current.notes.trim(), `[${new Date().toISOString()}] ${input.notes.trim()}`].filter(Boolean).join("\n")
          : current.notes;
        db.update(palateProfiles).set({
          sweetness: input.sweetness ?? current.sweetness, acidity: input.acidity ?? current.acidity,
          tannin: input.tannin ?? current.tannin, body: input.body ?? current.body, oak: input.oak ?? current.oak,
          adventurousness: input.adventurousness ?? current.adventurousness, notes: appended, updatedAt: new Date(),
        }).where(eq(palateProfiles.profileId, input.taster_profile_id)).run();
        return { updated: true, profile_id: input.taster_profile_id };
      },
    }),
    save_recommendation: tool({
      description: "Save a concrete recommendation for one participant or jointly for the household.", inputSchema: saveRecommendationSchema,
      execute: async (input) => {
        validateContext(context, input.for_profile_id);
        const id = crypto.randomUUID();
        db.insert(recommendations).values({
          id, householdId: context.householdId, profileId: input.for_profile_id,
          wineName: input.wine_name, producer: input.producer, grape: input.grape, region: input.region,
          style: input.style, priceBand: input.price_band, reasoning: input.reasoning, source: context.recommendationSource ?? "chat",
        }).run();
        return { saved: true, recommendation_id: id };
      },
    }),
    search_web: tool({
      description: "Provider-neutral fallback web search for current, externally verifiable facts (current wine facts, changing rules or releases, prices) when the selected model has no usable native search.",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async (input) => {
        const provider = getSearchProvider();
        const results = await provider.search(input.query);
        const sources = toSearchSources(results, provider.kind === "tavily" ? "tavily" : "fixture", input.query);
        return sources.length ? { unavailable: false, sources } : { unavailable: true, sources: [] };
      },
    }),
    search_wine_availability: tool({
      description: "Find where to buy a wine near a specific location. Requires a location — do not guess one.", inputSchema: searchAvailabilitySchema,
      execute: async (input) => {
        if (!input.location) return { unavailable: true, needs_location: true, sources: [] };
        const query = `buy ${input.query} wine shop near ${input.location}`;
        const provider = getSearchProvider();
        const results = await provider.search(query);
        const sources = toSearchSources(results, provider.kind === "tavily" ? "tavily" : "fixture", query);
        return sources.length ? { unavailable: false, sources } : { unavailable: true, sources: [] };
      },
    }),
  };
}
