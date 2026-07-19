import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Barrel, Bottle, Corkscrew, GrapeCluster, Journal, Sparkle, Terminal, WineGlass } from "../../src/components/icons";
import { grapeAppearance, type GrapeAppearance } from "../../src/lib/grape-appearance";

describe("pixel icon system", () => {
  it("AC-UI-6 renders the complete required set as accessible-hidden crisp-edge 16-grid SVGs", () => {
    const icons = [WineGlass, Bottle, GrapeCluster, Journal, Terminal, Barrel, Corkscrew, Sparkle];
    const markup = icons.map((Icon) => renderToStaticMarkup(<Icon size={16} color="#00E5FF" />));
    expect(markup).toHaveLength(8);
    for (const icon of markup) {
      expect(icon).toContain('viewBox="0 0 16 16"');
      expect(icon).toContain('shape-rendering="crispEdges"');
      expect(icon).toContain('aria-hidden="true"');
      expect(icon).toContain("<rect");
    }
    for (const name of ["WineGlass", "Bottle", "GrapeCluster", "Journal", "Terminal", "Barrel", "Corkscrew", "Sparkle"]) {
      expect(markup.some((icon) => icon.includes(`data-icon="${name}"`))).toBe(true);
    }
  });

  it("AC-UI-6 resolves natural grape appearances with the two curriculum exceptions", () => {
    expect(grapeAppearance("sauvignon-blanc", "white")).toBe("green-gold");
    expect(grapeAppearance("cabernet-sauvignon", "red")).toBe("blue-purple");
    expect(grapeAppearance("pinot-grigio", "white")).toBe("copper-pink");
    expect(grapeAppearance("gewurztraminer", "white")).toBe("rose-pink");
  });

  it("AC-UI-6 recolors one unchanged grape silhouette with all natural palettes", () => {
    const palettes: Record<GrapeAppearance, { base: string; highlight: string }> = {
      "green-gold": { base: "#9BBF30", highlight: "#E2E98A" },
      "blue-purple": { base: "#6F4BC8", highlight: "#B9A8EE" },
      "copper-pink": { base: "#B8735D", highlight: "#E5B09C" },
      "rose-pink": { base: "#C95B7D", highlight: "#F0A9BD" },
    };
    const appearances = Object.keys(palettes) as GrapeAppearance[];
    const markup = appearances.map((appearance) => renderToStaticMarkup(<GrapeCluster appearance={appearance} />));
    const geometry = markup.map((icon) => [...icon.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
      .map((match) => match.slice(1, 5).join(":")));

    for (const [index, appearance] of appearances.entries()) {
      expect(markup[index]).toContain(`data-grape-appearance="${appearance}"`);
      expect(markup[index]).toContain(`fill="${palettes[appearance].base}"`);
      expect(markup[index]).toContain(`fill="${palettes[appearance].highlight}"`);
      expect(geometry[index]).toEqual(geometry[0]);
    }

    const fallback = renderToStaticMarkup(<GrapeCluster color="#00E5FF" />);
    expect(fallback).toContain('fill="#00E5FF"');
    expect(fallback).not.toContain("data-grape-appearance");
  });

  it("AC-UI-11 defines both required Playwright projects for every e2e journey", async () => {
    const config = await import("../../playwright.config");
    expect(config.default.projects?.map((project) => project.name)).toEqual(["desktop", "mobile"]);
  });

  it("AC-UI-3 maps every verdict badge to its pinned semantic color", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.verdict-liked\s*\{[^}]*color:\s*var\(--green\)/s);
    expect(css).toMatch(/\.verdict-mixed\s*\{[^}]*color:\s*var\(--amber\)/s);
    expect(css).toMatch(/\.verdict-disliked\s*\{[^}]*color:\s*var\(--magenta\)/s);
  });
});
