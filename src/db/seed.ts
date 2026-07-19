import { sql } from "drizzle-orm";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, sqlite } from "./client";
import { grapes } from "./schema";

type GrapeSeed = typeof grapes.$inferInsert;

export const GRAPE_SEED: GrapeSeed[] = [
  {
    id: "sauvignon-blanc", slug: "sauvignon-blanc", name: "Sauvignon Blanc", color: "white", aka: [], orderIndex: 1,
    profile: "Sauvignon Blanc is light-bodied, sharply acidic, and usually unoaked. Its vivid herbal and citrus flavors make it one of the clearest grapes for learning what acidity feels like.",
    classicRegions: ["Marlborough, New Zealand", "Loire Valley, France", "Bordeaux, France"],
    whatToTasteFor: "Notice whether the wine makes the sides of your mouth water, then look for lime, grapefruit, fresh grass, or gooseberry. Compare that brisk feeling with a richer white such as oaked Chardonnay.",
    benchmarkStyles: ["Marlborough New Zealand Sauvignon Blanc, $12–18", "Loire Valley Sancerre, $22–35", "Bordeaux Blanc, $15–25"],
  },
  {
    id: "pinot-grigio", slug: "pinot-grigio", name: "Pinot Grigio", color: "white", aka: ["Pinot Gris"], orderIndex: 2,
    profile: "Pinot Grigio is generally light-bodied, dry, and clean, with moderate to high acidity. Italian versions emphasize citrus and pear, while Pinot Gris from Alsace can be broader and more textured.",
    classicRegions: ["Veneto, Italy", "Friuli-Venezia Giulia, Italy", "Alsace, France"],
    whatToTasteFor: "Look for lemon peel, green pear, and a faint almond note in a crisp Italian bottle. Pay attention to its light weight and compare it with the fuller texture of Chardonnay.",
    benchmarkStyles: ["Delle Venezie Pinot Grigio, $10–16", "Friuli Pinot Grigio, $15–24", "Alsace Pinot Gris, $18–28"],
  },
  {
    id: "riesling", slug: "riesling", name: "Riesling", color: "white", aka: [], orderIndex: 3,
    profile: "Riesling combines very high acidity with flavors of citrus, stone fruit, and flowers. It ranges from bone-dry to richly sweet, yet the acidity usually keeps even sweet examples lively rather than heavy.",
    classicRegions: ["Mosel, Germany", "Rheingau, Germany", "Clare Valley, Australia"],
    whatToTasteFor: "First decide whether sweetness is present, then notice how quickly the acidity makes your mouth water. Search for lime, green apple, peach, white flowers, and sometimes a distinctive mineral or petrol aroma.",
    benchmarkStyles: ["Mosel Kabinett Riesling, $16–25", "Dry Australian Riesling, $15–24", "German off-dry Riesling, $12–20"],
  },
  {
    id: "chardonnay", slug: "chardonnay", name: "Chardonnay", color: "white", aka: [], orderIndex: 4,
    profile: "Chardonnay is a shape-shifter: unoaked bottles can be lean and citrusy, while oak and malolactic fermentation create richer apple, butter, vanilla, and toast notes. Its body commonly ranges from medium to full with moderate to high acidity.",
    classicRegions: ["Burgundy, France", "California, USA", "Yarra Valley, Australia"],
    whatToTasteFor: "Ask whether the texture feels crisp like fresh apple or broad and creamy. Lemon and apple point toward the grape, while butter, vanilla, or toast usually reveal winemaking choices rather than fruit alone.",
    benchmarkStyles: ["Unoaked Mâcon-Villages, $16–25", "California oaked Chardonnay, $14–25", "Chablis, $22–38"],
  },
  {
    id: "chenin-blanc", slug: "chenin-blanc", name: "Chenin Blanc", color: "white", aka: ["Steen"], orderIndex: 5,
    profile: "Chenin Blanc has naturally high acidity and can be made dry, sparkling, or sweet. Typical flavors include apple, quince, pear, honey, and a woolly or waxy savory edge.",
    classicRegions: ["Loire Valley, France", "Stellenbosch, South Africa", "Swartland, South Africa"],
    whatToTasteFor: "Notice the tension between mouthwatering acidity and any honeyed richness. Look for tart apple, bruised pear, quince, chamomile, or beeswax, then decide whether the finish is dry or gently sweet.",
    benchmarkStyles: ["South African dry Chenin Blanc, $12–20", "Vouvray sec or demi-sec, $18–30", "Loire Crémant, $16–25"],
  },
  {
    id: "gewurztraminer", slug: "gewurztraminer", name: "Gewürztraminer", color: "white", aka: ["Gewurztraminer"], orderIndex: 6,
    profile: "Gewürztraminer is intensely aromatic, typically full-bodied, and lower in acidity than many white grapes. Rose, lychee, ginger, and tropical fruit often appear, sometimes with a little residual sweetness.",
    classicRegions: ["Alsace, France", "Alto Adige, Italy", "Washington, USA"],
    whatToTasteFor: "Smell before sipping and see whether rose petals, lychee, or ginger leap out of the glass. On the palate, compare its broad texture and softer acidity with the sharper line of Riesling.",
    benchmarkStyles: ["Alsace Gewürztraminer, $18–28", "Alto Adige Gewürztraminer, $20–30", "Washington off-dry Gewürztraminer, $12–20"],
  },
  {
    id: "albarino", slug: "albarino", name: "Albariño", color: "white", aka: ["Alvarinho"], orderIndex: 7,
    profile: "Albariño is a light- to medium-bodied coastal white with high acidity and aromatic stone fruit. Citrus, peach, white flowers, and a salty impression make it especially refreshing.",
    classicRegions: ["Rías Baixas, Spain", "Vinho Verde, Portugal", "California, USA"],
    whatToTasteFor: "Look for lime, peach, and flowers, then notice whether the finish suggests sea spray or crushed shell. Its combination of ripe fruit and brisk acidity is the central contrast.",
    benchmarkStyles: ["Rías Baixas Albariño, $15–24", "Portuguese Alvarinho, $14–22", "California Albariño, $18–28"],
  },
  {
    id: "viognier", slug: "viognier", name: "Viognier", color: "white", aka: [], orderIndex: 8,
    profile: "Viognier is an aromatic, full-bodied white with moderate or low acidity. Peach, apricot, orange blossom, and a sometimes oily texture distinguish it from crisper white grapes.",
    classicRegions: ["Condrieu, France", "Northern Rhône, France", "California, USA"],
    whatToTasteFor: "Find the ripe peach or apricot aroma, then pay attention to the wine's weight and soft rather than piercing acidity. A slight floral perfume and silky texture are useful markers.",
    benchmarkStyles: ["Languedoc Viognier, $12–18", "California Viognier, $16–25", "Condrieu, $45–75"],
  },
  {
    id: "pinot-noir", slug: "pinot-noir", name: "Pinot Noir", color: "red", aka: ["Spätburgunder"], orderIndex: 9,
    profile: "Pinot Noir is usually light- to medium-bodied with high acidity and low tannin. Red cherry, raspberry, earth, tea, and mushroom can appear, with oak adding spice rather than sheer weight.",
    classicRegions: ["Burgundy, France", "Willamette Valley, USA", "Central Otago, New Zealand"],
    whatToTasteFor: "Notice the pale color and whether your gums feel only lightly dried by tannin. Look for tart red fruit first, then earthy, leafy, or mushroom-like details as the wine opens.",
    benchmarkStyles: ["Bourgogne Rouge, $22–35", "Willamette Valley Pinot Noir, $22–35", "New Zealand Pinot Noir, $18–30"],
  },
  {
    id: "gamay", slug: "gamay", name: "Gamay", color: "red", aka: ["Gamay Noir", "Beaujolais"], orderIndex: 10,
    profile: "Gamay is light-bodied, high in acidity, and low in tannin, making it juicy and easy to chill slightly. Raspberry, cherry, violet, and sometimes banana or bubblegum aromas sit over a stony finish.",
    classicRegions: ["Beaujolais, France", "Loire Valley, France", "Niagara, Canada"],
    whatToTasteFor: "Focus on the rush of fresh red fruit and how little the tannin dries your mouth. Compare its playful fruit with Pinot Noir's earthier character, then look for violet or pepper.",
    benchmarkStyles: ["Beaujolais-Villages, $13–20", "Cru Beaujolais Morgon, $20–30", "Loire Gamay, $15–24"],
  },
  {
    id: "merlot", slug: "merlot", name: "Merlot", color: "red", aka: [], orderIndex: 11,
    profile: "Merlot is medium- to full-bodied with moderate acidity and plush, medium tannin. Plum, black cherry, cocoa, and herbs are common, with oak often adding vanilla and cedar.",
    classicRegions: ["Bordeaux Right Bank, France", "Washington, USA", "Chile"],
    whatToTasteFor: "Look for ripe plum or black cherry and notice whether the tannins feel soft and velvety rather than firm. Cocoa, dried herbs, and vanilla can help separate it from brighter, more structured Cabernet Sauvignon.",
    benchmarkStyles: ["Chilean Merlot, $10–18", "Washington Merlot, $18–30", "Bordeaux Supérieur, $15–25"],
  },
  {
    id: "cabernet-sauvignon", slug: "cabernet-sauvignon", name: "Cabernet Sauvignon", color: "red", aka: ["Cabernet"], orderIndex: 12,
    profile: "Cabernet Sauvignon is full-bodied with high tannin and medium to high acidity. Blackcurrant, blackberry, cedar, mint, and graphite are classic, and oak aging often brings toast and vanilla.",
    classicRegions: ["Bordeaux Left Bank, France", "Napa Valley, USA", "Coonawarra, Australia"],
    whatToTasteFor: "Feel how the tannin dries your gums like strong black tea, then look for cassis or blackberry. Herbal, cedar, or pencil-shaving notes often sit behind the dark fruit and become clearer with air.",
    benchmarkStyles: ["Chilean Cabernet Sauvignon, $12–20", "Bordeaux Médoc, $20–35", "California Cabernet Sauvignon, $20–40"],
  },
  {
    id: "malbec", slug: "malbec", name: "Malbec", color: "red", aka: ["Côt"], orderIndex: 13,
    profile: "Malbec is a deeply colored, full-bodied red with medium acidity and firm but often rounded tannin. Blackberry, plum, violet, cocoa, and sweet tobacco are frequent markers.",
    classicRegions: ["Mendoza, Argentina", "Cahors, France", "Salta, Argentina"],
    whatToTasteFor: "Look for purple color, dark plum or blackberry, and a floral violet lift. Compare the tannin's broad grip with Cabernet's more linear structure and notice any cocoa from oak.",
    benchmarkStyles: ["Mendoza Malbec, $12–20", "Uco Valley Malbec, $20–32", "Cahors Malbec, $15–25"],
  },
  {
    id: "syrah", slug: "syrah", name: "Syrah/Shiraz", color: "red", aka: ["Shiraz"], orderIndex: 14,
    profile: "Syrah is full-bodied with medium to high tannin and flavors that range from savory to lush. Blackberry, black pepper, smoked meat, olive, and violet define cooler styles; warmer Shiraz adds jam and chocolate.",
    classicRegions: ["Northern Rhône, France", "Barossa Valley, Australia", "Washington, USA"],
    whatToTasteFor: "Search for black pepper alongside blackberry, then decide whether the wine leans savory and smoky or ripe and jammy. Notice the substantial body and the tannin across your gums.",
    benchmarkStyles: ["Crozes-Hermitage Syrah, $22–35", "Barossa Shiraz, $16–28", "Washington Syrah, $20–35"],
  },
  {
    id: "grenache", slug: "grenache", name: "Grenache/Garnacha", color: "red", aka: ["Garnacha"], orderIndex: 15,
    profile: "Grenache is generous and high in alcohol, with medium body, low to medium tannin, and red-fruit warmth. Strawberry, raspberry, white pepper, dried herbs, and sometimes candied fruit are typical.",
    classicRegions: ["Southern Rhône, France", "Aragón, Spain", "Priorat, Spain"],
    whatToTasteFor: "Look for ripe strawberry and raspberry, then notice warmth from alcohol at the finish. Dried herbs or white pepper can add a savory counterpoint while the tannins remain relatively gentle.",
    benchmarkStyles: ["Spanish Garnacha, $10–18", "Côtes du Rhône blend, $14–22", "Priorat Garnacha blend, $25–40"],
  },
  {
    id: "sangiovese", slug: "sangiovese", name: "Sangiovese", color: "red", aka: ["Brunello", "Prugnolo Gentile"], orderIndex: 16,
    profile: "Sangiovese is medium-bodied with high acidity and medium to high tannin. Sour cherry, red plum, tomato leaf, leather, and dried herbs give it a distinctly savory profile.",
    classicRegions: ["Tuscany, Italy", "Romagna, Italy", "Corsica, France"],
    whatToTasteFor: "Notice the mouthwatering acidity, then look for tart cherry and a savory tomato-leaf or dried-herb note. The combination makes Sangiovese especially vivid alongside food.",
    benchmarkStyles: ["Chianti Classico, $18–30", "Rosso di Montalcino, $22–35", "Morellino di Scansano, $14–22"],
  },
  {
    id: "tempranillo", slug: "tempranillo", name: "Tempranillo", color: "red", aka: ["Tinto Fino", "Tinta del País"], orderIndex: 17,
    profile: "Tempranillo is medium- to full-bodied with moderate acidity and tannin. Cherry, plum, leather, tobacco, and dill or coconut from American oak are classic in aged Spanish examples.",
    classicRegions: ["Rioja, Spain", "Ribera del Duero, Spain", "Toro, Spain"],
    whatToTasteFor: "Find the red or black cherry core, then separate fruit from aging notes such as leather, tobacco, vanilla, or dill. Notice whether the tannin feels polished by time or still firm.",
    benchmarkStyles: ["Rioja Crianza, $14–22", "Rioja Reserva, $22–35", "Ribera del Duero Roble, $16–26"],
  },
  {
    id: "zinfandel", slug: "zinfandel", name: "Zinfandel", color: "red", aka: ["Primitivo"], orderIndex: 18,
    profile: "Zinfandel is a full-bodied, high-alcohol red with moderate tannin and often jammy fruit. Blackberry, raspberry preserves, black pepper, baking spice, and sometimes a sweet impression are common.",
    classicRegions: ["California, USA", "Puglia, Italy", "Lodi, USA"],
    whatToTasteFor: "Look for berry jam and black pepper, then notice the warmth of alcohol after swallowing. Decide whether the fruit tastes freshly ripe or cooked and whether any apparent sweetness is actual sugar or simply very ripe fruit.",
    benchmarkStyles: ["Lodi Zinfandel, $12–20", "Sonoma Zinfandel, $20–35", "Puglia Primitivo, $10–18"],
  },
];

export function seedCurriculum(database: typeof db = db): void {
  database.transaction((tx) => {
    for (const grape of GRAPE_SEED) {
      tx.insert(grapes).values(grape).onConflictDoUpdate({
        target: grapes.slug,
        set: {
          name: grape.name,
          color: grape.color,
          aka: grape.aka,
          profile: grape.profile,
          classicRegions: grape.classicRegions,
          whatToTasteFor: grape.whatToTasteFor,
          benchmarkStyles: grape.benchmarkStyles,
          orderIndex: grape.orderIndex,
        },
      }).run();
    }
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  seedCurriculum();
  const count = db.select({ count: sql<number>`count(*)` }).from(grapes).get();
  console.log(`Seeded ${count?.count ?? 0} curriculum grapes.`);
  sqlite.close();
}
