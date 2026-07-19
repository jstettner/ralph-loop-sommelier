import { describe, expect, it } from "vitest";
import { derivePalateDimensions } from "../../src/lib/palate";

describe("palate quiz derivation", () => {
  it("AC-MEM-1 maps every documented answer category into palate dimensions", () => {
    const bold = derivePalateDimensions({
      coffee: "black", juice: "grapefruit", tea: "strong", chocolate: "dark",
      enjoyed: ["bold_reds", "rich_whites"], adventurousness: 5,
    });
    expect(bold).toMatchObject({ sweetness: 2, acidity: 5, tannin: 4, body: 5, oak: 4, adventurousness: 5 });
    expect(bold.notes).toContain("bold reds");
    expect(bold.notes).toContain("rich whites");

    const gentle = derivePalateDimensions({
      coffee: "sweet", juice: "orange", tea: "light", chocolate: "milk",
      enjoyed: ["light_reds", "crisp_whites", "bubbles"], adventurousness: 1,
    });
    expect(gentle.sweetness).toBeGreaterThan(bold.sweetness ?? 0);
    expect(gentle.acidity).toBe(3);
    expect(gentle.tannin).toBeLessThan(bold.tannin ?? 5);
    expect(gentle.body).toBe(2);
    expect(gentle.oak).toBeNull();
  });
});
