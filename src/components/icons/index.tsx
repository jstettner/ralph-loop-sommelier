import React, { type ReactNode, type SVGProps } from "react";
import type { GrapeAppearance } from "@/lib/grape-appearance";

type IconProps = { size?: 16 | 24 | 32; color?: string } & Omit<SVGProps<SVGSVGElement>, "color">;

const OUTLINE = "#1A1A1C";
const HIGHLIGHT = "#E8E8E3";
const GRAPE_PALETTES = {
  "green-gold": { base: "#9BBF30", highlight: "#E2E98A" },
  "blue-purple": { base: "#6F4BC8", highlight: "#B9A8EE" },
  "copper-pink": { base: "#B8735D", highlight: "#E5B09C" },
  "rose-pink": { base: "#C95B7D", highlight: "#F0A9BD" },
} as const satisfies Record<GrapeAppearance, { base: string; highlight: string }>;

function PixelIcon({ size = 24, color = "currentColor", children, ...props }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" style={{ imageRendering: "pixelated" }} {...props}>
    <g fill={color}>{children}</g>
  </svg>;
}

export function WineGlass(props: IconProps) {
  return <PixelIcon data-icon="WineGlass" {...props}>
    <rect x="3" y="1" width="10" height="7" fill={OUTLINE} />
    <rect x="6" y="7" width="4" height="6" fill={OUTLINE} />
    <rect x="4" y="12" width="8" height="3" fill={OUTLINE} />
    <rect x="4" y="2" width="8" height="4" />
    <rect x="6" y="6" width="4" height="1" />
    <rect x="7" y="7" width="2" height="6" />
    <rect x="5" y="13" width="6" height="1" />
    <rect x="5" y="2" width="1" height="2" fill={HIGHLIGHT} opacity=".7" />
  </PixelIcon>;
}

export function Bottle(props: IconProps) {
  return <PixelIcon data-icon="Bottle" {...props}>
    <rect x="5" y="0" width="6" height="3" fill={OUTLINE} />
    <rect x="6" y="2" width="4" height="4" fill={OUTLINE} />
    <rect x="4" y="5" width="8" height="11" fill={OUTLINE} />
    <rect x="6" y="0" width="4" height="2" />
    <rect x="7" y="3" width="2" height="3" />
    <rect x="5" y="6" width="6" height="9" />
    <rect x="6" y="9" width="4" height="3" fill={HIGHLIGHT} />
  </PixelIcon>;
}

export function GrapeCluster({ appearance, color, ...props }: IconProps & { appearance?: GrapeAppearance }) {
  const palette = appearance ? GRAPE_PALETTES[appearance] : undefined;
  return <PixelIcon data-icon="GrapeCluster" data-grape-appearance={appearance} color={palette?.base ?? color} {...props}>
    <rect x="7" y="0" width="3" height="4" fill={OUTLINE} />
    <rect x="3" y="3" width="10" height="5" fill={OUTLINE} />
    <rect x="4" y="8" width="8" height="3" fill={OUTLINE} />
    <rect x="5" y="11" width="6" height="2" fill={OUTLINE} />
    <rect x="6" y="12" width="4" height="3" fill={OUTLINE} />
    <rect x="8" y="0" width="1" height="3" fill={palette?.highlight ?? HIGHLIGHT} />
    <rect x="4" y="4" width="8" height="2" />
    <rect x="5" y="7" width="6" height="2" />
    <rect x="6" y="10" width="4" height="2" />
    <rect x="7" y="13" width="2" height="1" />
    <rect x="5" y="4" width="1" height="1" fill={palette?.highlight ?? HIGHLIGHT} opacity=".7" />
  </PixelIcon>;
}

export function Journal(props: IconProps) {
  return <PixelIcon data-icon="Journal" {...props}>
    <rect x="3" y="1" width="11" height="14" fill={OUTLINE} />
    <rect x="5" y="2" width="8" height="12" />
    <rect x="6" y="4" width="5" height="1" fill={OUTLINE} />
    <rect x="6" y="7" width="5" height="1" fill={OUTLINE} />
    <rect x="6" y="10" width="5" height="1" fill={OUTLINE} />
    <rect x="2" y="3" width="2" height="2" fill={HIGHLIGHT} />
    <rect x="2" y="7" width="2" height="2" fill={HIGHLIGHT} />
    <rect x="2" y="11" width="2" height="2" fill={HIGHLIGHT} />
  </PixelIcon>;
}

export function Terminal(props: IconProps) {
  return <PixelIcon data-icon="Terminal" {...props}>
    <rect x="1" y="2" width="14" height="12" fill={OUTLINE} />
    <rect x="2" y="3" width="12" height="10" fill="#050505" />
    <rect x="4" y="5" width="2" height="1" />
    <rect x="5" y="6" width="2" height="1" />
    <rect x="6" y="7" width="2" height="1" />
    <rect x="5" y="8" width="2" height="1" />
    <rect x="4" y="9" width="2" height="1" />
    <rect x="9" y="9" width="3" height="2" />
  </PixelIcon>;
}

export function Barrel(props: IconProps) {
  return <PixelIcon data-icon="Barrel" {...props}>
    <rect x="3" y="1" width="10" height="14" fill={OUTLINE} />
    <rect x="2" y="4" width="1" height="8" fill={OUTLINE} />
    <rect x="13" y="4" width="1" height="8" fill={OUTLINE} />
    <rect x="4" y="2" width="8" height="12" />
    <rect x="3" y="5" width="1" height="6" />
    <rect x="12" y="5" width="1" height="6" />
    <rect x="2" y="4" width="12" height="1" fill={OUTLINE} />
    <rect x="2" y="11" width="12" height="1" fill={OUTLINE} />
    <rect x="7" y="7" width="2" height="2" fill={OUTLINE} />
    <rect x="5" y="2" width="1" height="2" fill={HIGHLIGHT} opacity=".7" />
  </PixelIcon>;
}

export function Corkscrew(props: IconProps) {
  return <PixelIcon data-icon="Corkscrew" {...props}>
    <rect x="3" y="1" width="10" height="4" fill={OUTLINE} />
    <rect x="6" y="4" width="4" height="3" fill={OUTLINE} />
    <rect x="4" y="2" width="8" height="2" />
    <rect x="7" y="5" width="2" height="2" />
    <rect x="6" y="7" width="3" height="1" />
    <rect x="8" y="8" width="1" height="1" />
    <rect x="6" y="9" width="3" height="1" />
    <rect x="6" y="10" width="1" height="1" />
    <rect x="6" y="11" width="3" height="1" />
    <rect x="8" y="12" width="1" height="1" />
    <rect x="7" y="13" width="1" height="1" />
    <rect x="5" y="2" width="1" height="1" fill={HIGHLIGHT} opacity=".7" />
  </PixelIcon>;
}

export function Sparkle(props: IconProps) {
  return <PixelIcon data-icon="Sparkle" {...props}>
    <rect x="6" y="2" width="4" height="12" fill={OUTLINE} />
    <rect x="2" y="6" width="12" height="4" fill={OUTLINE} />
    <rect x="7" y="3" width="2" height="10" />
    <rect x="3" y="7" width="10" height="2" />
    <rect x="7" y="7" width="2" height="2" fill={HIGHLIGHT} />
    <rect x="13" y="2" width="1" height="1" />
    <rect x="2" y="13" width="1" height="1" />
  </PixelIcon>;
}

export { PixelIcon };
