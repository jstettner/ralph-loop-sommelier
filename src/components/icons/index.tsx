import React, { type ReactNode, type SVGProps } from "react";

type IconProps = { size?: 16 | 24 | 32; color?: string } & Omit<SVGProps<SVGSVGElement>, "color">;

function PixelIcon({ size = 24, color = "currentColor", children, ...props }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" style={{ imageRendering: "pixelated" }} {...props}>
    <g fill="#1A1A1C">{children}</g><rect x="7" y="2" width="2" height="2" fill="#E8E8E3" opacity=".65" /><rect x="4" y="4" width="8" height="8" fill={color} />
  </svg>;
}

export function WineGlass(props: IconProps) { return <PixelIcon data-icon="WineGlass" {...props}><rect x="3" y="1" width="10" height="2" /><rect x="2" y="3" width="2" height="5" /><rect x="12" y="3" width="2" height="5" /><rect x="4" y="8" width="8" height="2" /><rect x="7" y="10" width="2" height="4" /><rect x="4" y="14" width="8" height="2" /></PixelIcon>; }
export function Bottle(props: IconProps) { return <PixelIcon data-icon="Bottle" {...props}><rect x="6" y="0" width="4" height="4" /><rect x="5" y="4" width="6" height="3" /><rect x="3" y="7" width="10" height="9" /></PixelIcon>; }
export function GrapeCluster(props: IconProps) { return <PixelIcon data-icon="GrapeCluster" {...props}><rect x="8" y="0" width="5" height="2" /><rect x="7" y="2" width="3" height="2" /><rect x="3" y="4" width="10" height="7" /><rect x="5" y="11" width="6" height="3" /><rect x="7" y="14" width="2" height="2" /></PixelIcon>; }
export function Journal(props: IconProps) { return <PixelIcon data-icon="Journal" {...props}><rect x="2" y="1" width="12" height="14" /><rect x="0" y="3" width="4" height="2" /><rect x="0" y="7" width="4" height="2" /><rect x="0" y="11" width="4" height="2" /></PixelIcon>; }
export function Terminal(props: IconProps) { return <PixelIcon data-icon="Terminal" {...props}><rect x="1" y="2" width="14" height="12" /><rect x="3" y="5" width="2" height="2" /><rect x="5" y="7" width="2" height="2" /><rect x="3" y="9" width="2" height="2" /><rect x="8" y="10" width="4" height="2" /></PixelIcon>; }
export function Barrel(props: IconProps) { return <PixelIcon data-icon="Barrel" {...props}><rect x="3" y="1" width="10" height="14" /><rect x="1" y="3" width="14" height="2" /><rect x="1" y="11" width="14" height="2" /><rect x="7" y="7" width="2" height="2" /></PixelIcon>; }
export function Corkscrew(props: IconProps) { return <PixelIcon data-icon="Corkscrew" {...props}><rect x="2" y="1" width="12" height="3" /><rect x="7" y="4" width="2" height="3" /><rect x="6" y="7" width="4" height="2" /><rect x="8" y="9" width="3" height="2" /><rect x="6" y="11" width="3" height="2" /><rect x="7" y="13" width="2" height="3" /></PixelIcon>; }
export function Sparkle(props: IconProps) { return <PixelIcon data-icon="Sparkle" {...props}><rect x="7" y="0" width="2" height="5" /><rect x="7" y="11" width="2" height="5" /><rect x="0" y="7" width="5" height="2" /><rect x="11" y="7" width="5" height="2" /><rect x="5" y="5" width="6" height="6" /></PixelIcon>; }

export { PixelIcon };
