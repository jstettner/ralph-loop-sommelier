import { describe, expect, it } from "vitest";
import { buildDynamicContext, buildStableSystemPrefix } from "../../src/lib/llm/system-prompt";

describe("search scoping in the system prompt (AC-SRCH-8)", () => {
  it("AC-SRCH-8 scopes when to search and tailors the mechanism to the model's native capability", () => {
    const stable = buildStableSystemPrefix("CURRICULUM\n\n- Gamay: bright and light.");
    // Stable curriculum / technique questions must not trigger a search.
    expect(stable).toMatch(/do not search the web/i);
    // Current, externally verifiable facts may search.
    expect(stable).toMatch(/current wine facts|freshness/i);
    // Nearby buying asks for a missing location.
    expect(stable).toMatch(/city or zip|need(s)? a location/i);
    // Unavailable results are disclosed, never fabricated.
    expect(stable).toMatch(/could not verify it live/i);
    expect(stable).toMatch(/never invent store names/i);

    // The mechanism line is dynamic: it reflects this exact model's real native capability.
    expect(buildDynamicContext("PMEM", false, true)).toMatch(/built-in web search/i);
    const fallback = buildDynamicContext("PMEM", false, false);
    expect(fallback).toMatch(/no built-in web search/i);
    expect(fallback).toMatch(/search_web/);
  });

  it("AC-REC-8 tells the model to avoid visible picks and retry a rejected duplicate", () => {
    const stable = buildStableSystemPrefix("CURRICULUM");
    expect(stable).toContain("CURRENT VISIBLE RECOMMENDATIONS");
    expect(stable).toMatch(/never repeat a normalized wine name \+ producer/i);
    expect(stable).toMatch(/duplicate=true and retry=true/i);
    expect(stable).toMatch(/call it again with a different wine/i);
  });
});
