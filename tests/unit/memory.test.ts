import { describe, expect, it } from "vitest";
import { assembleMemory, assembleRecommendationMemory, type MemoryParticipant } from "../../src/server/memory";

describe("chat memory assembly", () => {
  it("AC-CHAT-4 includes every participant identity, dimensions, and verdict lists while omitting empty details", () => {
    const participants: MemoryParticipant[] = [
      {
        id: "profile-alex", name: "Alex", dimensions: { acidity: 5, tannin: 2, oak: null }, notes: "Likes bright wines.",
        quizAnswers: { coffee: "black" },
        tastings: [
          { wine: "Loire Sauvignon Blanc", verdict: "liked", rating: 4, nose: ["lime"], flavors: ["grass"] },
          { wine: "Oaked Chardonnay", verdict: "disliked", rating: 2, nose: ["vanilla"], flavors: [] },
        ],
      },
      { id: "profile-sam", name: "Sam", dimensions: { acidity: null }, notes: "", quizAnswers: null, tastings: [] },
    ];
    const prompt = assembleMemory(participants, [{ name: "Gamay", profile: "Gamay is light-bodied and bright. It is low in tannin." }]);
    expect(prompt).toContain("PARTICIPANT profile-alex | Alex");
    expect(prompt).toContain("PARTICIPANT profile-sam | Sam");
    expect(prompt).toContain("acidity=5/5");
    expect(prompt).toContain("Liked wines: Loire Sauvignon Blanc");
    expect(prompt).toContain("Disliked wines: Oaked Chardonnay");
    expect(prompt).not.toContain("Liked wines: \n");
    expect(prompt).toContain("Gamay is light-bodied and bright.");
  });

  it("AC-REC-8 gives the model the complete visible recommendation catalog", () => {
    const prompt = assembleRecommendationMemory([
      { wineName: "Mendoza Malbec", producer: null },
      { wineName: "Etna Rosso", producer: "Tenuta delle Terre Nere" },
    ]);
    expect(prompt).toContain("CURRENT VISIBLE RECOMMENDATIONS");
    expect(prompt).toContain("- Mendoza Malbec | producer: (none)");
    expect(prompt).toContain("- Etna Rosso | producer: Tenuta delle Terre Nere");
    expect(prompt).toMatch(/choose a useful alternative/i);
  });
});
