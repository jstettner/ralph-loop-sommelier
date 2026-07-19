import { describe, expect, it } from "vitest";
import { toolLabel } from "../../src/lib/tool-summary";

describe("recommendation tool summaries", () => {
  it("AC-REC-8 describes the duplicate fallback as a retry rather than a successful save", () => {
    expect(toolLabel({
      type: "tool-save_recommendation",
      state: "output-available",
      output: { saved: false, duplicate: true, retry: true },
    })).toBe("Recommendation already queued — choosing another");
    expect(toolLabel({
      type: "tool-save_recommendation",
      state: "output-available",
      output: { saved: true },
    })).toBe("Saved recommendation");
  });
});
