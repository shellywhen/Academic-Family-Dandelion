export const COMPACT_BREAKPOINT = 768;

export function isCompactViewport(width: number, height: number): boolean {
  return Math.min(width, height) < COMPACT_BREAKPOINT;
}

export type LogoPlacement = "top-left" | "bottom-left" | "bottom-center";

export type ViewportTuning = {
  logoScale: number;
  logoInsetScale: number;
  logoPlacement: LogoPlacement;
  /** Canvas px from the left edge to the logo block. */
  logoMarginX: number;
  /** Canvas px from the top (top-left) or bottom (bottom-left) edge. */
  logoMarginY: number;
  /** Multiplier on rendered node disk radius. */
  nodeScale: number;
  /** Minimum radius for hub / faculty nodes (canvas px). */
  nodeRadiusFloor: number;
  /** Minimum radius for leaf (green) nodes (canvas px). */
  leafRadiusFloor: number;
  /** Extra multiplier on leaf (non-faculty) node radius. */
  leafNodeScale: number;
  /** p5.brush pen weight for advisor–student stems. */
  stemWeight: number;
};

/** Scales logo and nodes for narrow viewports. */
export function getViewportTuning(width: number, height: number): ViewportTuning {
  const minDim = Math.min(width, height);
  if (minDim >= 900) {
    return {
      logoScale: 1,
      logoInsetScale: 1,
      logoPlacement: "bottom-left",
      logoMarginX: 400,
      logoMarginY: 88,
      nodeScale: 0.75,
      nodeRadiusFloor: 6,
      leafRadiusFloor: 8,
      leafNodeScale: 1.35,
      stemWeight: 0.65,
    };
  }
  if (minDim >= COMPACT_BREAKPOINT) {
    return {
      logoScale: 0.72,
      logoInsetScale: 0.82,
      logoPlacement: "bottom-left",
      logoMarginX: 400,
      logoMarginY: 72,
      nodeScale: 0.65,
      nodeRadiusFloor: 3,
      leafRadiusFloor: 4,
      leafNodeScale: 1.15,
      stemWeight: 0.85,
    };
  }
  const t = Math.max(0, Math.min(1, (minDim - 320) / (COMPACT_BREAKPOINT - 320)));
  return {
    logoScale: 0.36 + t * 0.26,
    logoInsetScale: 0.42 + t * 0.38,
    logoPlacement: "bottom-left",
    logoMarginX: 52 + t * 80,
    logoMarginY: 200 + t * 30,
    nodeScale: 0.65 + t * 0.23,
    nodeRadiusFloor: 2.5 + t * 0.5,
    leafRadiusFloor: 2.5 + t * 0.5,
    leafNodeScale: 1.05,
    stemWeight: 0.95,
  };
}
