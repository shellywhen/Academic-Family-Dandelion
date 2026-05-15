import type { ReactNode } from "react";

/**
 * Representation of a person in the academic family tree.
 */
export type SimplePosition = { x: number; y: number; z: number };

export type NodeDetails = {
  advisor?: string;
  career?: string;
  startYear?: number;
  graduationYear?: number;
  graduationUniversity?: string;
  facultyPosition?: string;
  personalWebsite?: string;
  latitude?: number;
  longitude?: number;
};

export type GraphNode = {
  id: string;
  label: string;
  subtitle?: string;
  advisorId?: string;
  isRoot: boolean;
  isFaculty: boolean;
  details: NodeDetails;
};

/** Lightweight link between advisor and student. */
export type EdgeT = { source: string; target: string };

export type GraphDataset = {
  nodes: GraphNode[];
  edges: EdgeT[];
};

export type EdgeCurveOverride = {
  /** Lateral curvature factor applied to the Bezier control points. */
  curvature?: number;
  /** Optional floor for the curvature ramp. */
  curvatureMin?: number;
  /** Optional ceiling for the curvature ramp. */
  curvatureMax?: number;
  /** Optional vertical lift applied to the first/second control point pair. */
  lift?: number;
  /** Override the point where the curve reaches full bend strength. */
  lengthForFullCurve?: number;
  /** Override the inset scale at the start of the spline. */
  startInsetScale?: number;
  /** Override the inset scale at the end of the spline. */
  endInsetScale?: number;
  /** Override the planar spiral strength used to tilt the curve. */
  planarSpiralStrength?: number;
};

/** Parameters controlling how advisor edges are rendered as splines. */
export type EdgeLayoutSettings = {
  curvatureMin: number;
  curvatureMax: number;
  lengthForFullCurve: number;
  startInsetScale: number;
  endInsetScale: number;
  planarSpiralStrength: number;
  /** p5.brush pen weight for advisor–student stems (default 0.95). */
  stemWeight?: number;
  curvature?: number;
  lift?: number;
};

export type NodeLayout = GraphNode & {
  x: number;
  y: number;
  z: number;
  angle: number;
  radius: number;
  depth: number;
  radialFromParent: number;
  baseRadialFromParent: number;
  bumpFromParent: number;
  size: number;
  color: string;
  hasChildren: boolean;
  simplePosition?: SimplePosition;
  inputOrder?: number;
  edgeOverride?: EdgeCurveOverride;
};

export type NodeT = NodeLayout;

/** Container for the full graph with layout information. */
export type GraphT = {
  nodes: NodeT[];
  edges: EdgeT[];
  edgeSettings: EdgeLayoutSettings;
};

/**
 * Layout bounds used by the camera helpers and animation blending.
 */
export type GraphBounds = {
  center: { x: number; y: number; z: number };
  radius: number;
};

export type GraphReference = GraphT;

/** Node enriched with animation visibility flags. */
export type RenderedNode = NodeT & {
  isVisible?: boolean;
  hideIncomingEdge?: boolean;
  labelNormal?: SimplePosition;
  hideLabel?: boolean;
};

/**
 * Styling options used when rendering text labels for a node.
 */
export type NodeLabelAppearance = {
  fontSize: number;
  outlineWidth: number;
  offset: number;
  highlightOffset: number;
  isHighlighted: boolean;
};

/**
 * Normalized vector pointing from a node toward its parent.
 */
export type ParentDirection = { dx: number; dy: number };

export type GraphStructure = {
  nodes: Map<string, NodeT>;
  children: Map<string, string[]>;
  rootId: string;
};

export type GraphBuildOptions = {
  orientation?: OrientationSign;
};

export type OrientationSign = 1 | -1;

export type SpecialCaseKey = string;

export type NodeLayoutCase = {
  degreeOffset?: number;
  distance?: number;
  distanceOffset?: number;
  weightScale?: number;
  verticalOffset?: number;
};

export type ChildSectorConfig = {
  startDegree?: number;
  spanDegree?: number;
  spanDegreeMin?: number;
  spanDegreeMax?: number;
  perChildDegree: number;
  orientation?: OrientationSign;
};

export type ChildSectorOverride = Partial<
  Omit<ChildSectorConfig, "perChildDegree">
> & {
  perChildDegree?: number;
};

export type SpecialCaseLayoutConfig = {
  node?: NodeLayoutCase;
  child?: ChildSectorOverride;
  edge?: EdgeCurveOverride;
};

export type LayoutSettings = {
  orientation: OrientationSign;
  node: {
    distances: number[];
    distanceOffset: number;
    verticalOffset: number;
  };
  edge: EdgeLayoutSettings;
  child: {
    perDepth: ChildSectorConfig[];
    gap: {
      base: number;
      falloff: number;
      max: number;
    };
  };
  specialCases: Record<SpecialCaseKey, SpecialCaseLayoutConfig>;
};

export type LayoutEntry = {
  angle: number;
  radius: number;
  x: number;
  y: number;
  depth: number;
  sectorStart: number;
  sectorEnd: number;
  localRadius: number;
  baseRadius: number;
};

/**
 * Props consumed by the high-level GraphScene React component.
 */
export type GraphSceneProps = {
  nodes: RenderedNode[];
  edges: EdgeT[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  resetFlag: boolean;
  staticBounds: GraphBounds | null;
  edgeSettings?: EdgeLayoutSettings;
  extras?: ReactNode | null;
  /** Indicates an animation is currently running; used to gate camera auto-recentering. */
  isAnimating?: boolean;
};
