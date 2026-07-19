import { z } from "zod";

export const quizAnswersSchema = z.object({
  coffee: z.enum(["black", "milk", "sweet", "none"]),
  juice: z.enum(["grapefruit", "orange"]),
  tea: z.enum(["strong", "light"]),
  chocolate: z.enum(["dark", "milk"]),
  enjoyed: z.array(z.enum(["bold_reds", "light_reds", "crisp_whites", "rich_whites", "rose", "bubbles", "none"])),
  adventurousness: z.number().int().min(1).max(5),
});

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;
export type PalateDimensions = {
  sweetness: number | null;
  acidity: number | null;
  tannin: number | null;
  body: number | null;
  oak: number | null;
  adventurousness: number;
  notes: string;
};

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function derivePalateDimensions(answers: QuizAnswers): PalateDimensions {
  const tannin: number[] = [];
  const sweetness: number[] = [];
  if (answers.coffee !== "none") {
    const coffee = { black: [4, 1], milk: [2, 2], sweet: [1, 5] } as const;
    tannin.push(coffee[answers.coffee][0]);
    sweetness.push(coffee[answers.coffee][1]);
  }
  tannin.push(answers.tea === "strong" ? 5 : 2);
  tannin.push(answers.chocolate === "dark" ? 4 : 2);
  sweetness.push(answers.chocolate === "dark" ? 2 : 4);

  const styles = answers.enjoyed.filter((style) => style !== "none");
  const bodyValues = styles.map((style) => ({
    bold_reds: 5, light_reds: 2, crisp_whites: 2, rich_whites: 4, rose: 2, bubbles: 2,
  })[style]);
  const oakValues = styles.flatMap((style) => style === "bold_reds" ? [4] : style === "rich_whites" ? [4] : []);
  const styleLabels: Record<(typeof styles)[number], string> = {
    bold_reds: "bold reds", light_reds: "light reds", crisp_whites: "crisp whites",
    rich_whites: "rich whites", rose: "rosé", bubbles: "sparkling wine",
  };

  return {
    sweetness: average(sweetness),
    acidity: answers.juice === "grapefruit" ? 5 : 3,
    tannin: average(tannin),
    body: average(bodyValues),
    oak: average(oakValues),
    adventurousness: answers.adventurousness,
    notes: styles.length ? `Onboarding interests: ${styles.map((style) => styleLabels[style]).join(", ")}.` : "",
  };
}
