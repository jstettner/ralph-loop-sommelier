export type GrapeAppearance = "green-gold" | "blue-purple" | "copper-pink" | "rose-pink";

export function grapeAppearance(slug: string, color: "red" | "white"): GrapeAppearance {
  if (slug === "pinot-grigio") return "copper-pink";
  if (slug === "gewurztraminer") return "rose-pink";
  return color === "red" ? "blue-purple" : "green-gold";
}
