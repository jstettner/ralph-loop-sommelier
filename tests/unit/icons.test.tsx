import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Barrel, Bottle, Corkscrew, GrapeCluster, Journal, Sparkle, Terminal, WineGlass } from "../../src/components/icons";

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
