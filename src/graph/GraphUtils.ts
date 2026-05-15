import type {
  NodeT,
  EdgeLayoutSettings,
  EdgeCurveOverride,
  GraphBounds,
} from "./GraphType";
import * as THREE from "three";

const TWO_PI = Math.PI * 2;
const MIN_DISTANCE = 1e-6;
const MAX_INSET_RATIO = 0.45;

type ResolvedEdgeParams = EdgeLayoutSettings & EdgeCurveOverride;

function resolveEdgeParams(
  settings: EdgeLayoutSettings,
  override?: EdgeCurveOverride
): ResolvedEdgeParams {
  return (override ? { ...settings, ...override } : settings) as ResolvedEdgeParams;
}

function computeInset(distance: number, nodeSize: number, scale: number): number {
  const inset = Math.max(nodeSize * scale, 0);
  return Math.min(inset, distance * MAX_INSET_RATIO);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function spanBetween(start: number, end: number): number {
  let span = end - start;
  if (span <= 0) span += TWO_PI;
  return span;
}

export function wrapAngle(angle: number): number {
  let wrapped = angle % TWO_PI;
  if (wrapped < 0) wrapped += TWO_PI;
  return wrapped;
}

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  let normalized = angle % TWO_PI;
  if (normalized < -Math.PI) {
    normalized += TWO_PI;
  } else if (normalized > Math.PI) {
    normalized -= TWO_PI;
  }
  return normalized;
}

export function normalizeAnglePositive(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Compute the bounding sphere for the currently rendered nodes.
 */
export function calculateGraphBounds<
  T extends { x: number; y: number; z: number; isVisible?: boolean },
>(nodes: T[]): GraphBounds | null {
  if (!nodes.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let hasVisible = false;

  nodes.forEach((node) => {
    if (node.isVisible === false) {
      return;
    }
    hasVisible = true;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    minZ = Math.min(minZ, node.z);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
    maxZ = Math.max(maxZ, node.z);
  });

  if (!hasVisible) {
    return null;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  const radius = Math.max(width, height, depth) / 2 || 1;
  return {
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    },
    radius,
  };
}

/**
 * Generate the curved polyline representing the advisor-student connection.
 */
export function buildEdgeCurvePoints(
  source: NodeT,
  target: NodeT,
  edgeSettings: EdgeLayoutSettings,
  override?: EdgeCurveOverride
): [number, number, number][] {
  const start = new THREE.Vector3(source.x, source.y, source.z);
  const end = new THREE.Vector3(target.x, target.y, target.z);
  const delta = end.clone().sub(start);
  const distance = delta.length();

  if (!Number.isFinite(distance) || distance <= MIN_DISTANCE) {
    return [
      [start.x, start.y, start.z],
      [end.x, end.y, end.z],
    ];
  }

  const params = resolveEdgeParams(edgeSettings, override);
  const planarLength = Math.hypot(delta.x, delta.y);
  const direction = delta.clone().normalize();
  const insetStart = computeInset(distance, source.size, params.startInsetScale);
  const insetEnd = computeInset(distance, target.size, params.endInsetScale);

  const normal2D =
    planarLength > MIN_DISTANCE
      ? new THREE.Vector2(-delta.y, delta.x).normalize()
      : new THREE.Vector2(0, 1);

  const curvatureRatio =
    params.lengthForFullCurve > 0
      ? clamp(planarLength / params.lengthForFullCurve, 0, 1)
      : 1;
  const baseCurvature =
    params.curvatureMin +
    (params.curvatureMax - params.curvatureMin) * curvatureRatio;
  const bendDirection = new THREE.Vector3(normal2D.x, normal2D.y, 0);
  const baseBendMagnitude = baseCurvature * planarLength;
  let startBend = bendDirection.clone().multiplyScalar(baseBendMagnitude);
  let endBend = startBend.clone();
  const baseLift = baseCurvature * params.planarSpiralStrength * 0.5 * distance;
  let startLift = baseLift;
  let endLift = baseLift;

  if (params.curvature !== undefined) {
    const specialMagnitude = params.curvature * planarLength;
    const specialBend = bendDirection.clone().multiplyScalar(specialMagnitude);
    startBend = specialBend;
    endBend = specialBend.clone().multiplyScalar(-1);
  }

  if (params.lift !== undefined) {
    const liftMagnitude = params.lift * distance;
    startLift = liftMagnitude;
    endLift = -liftMagnitude;
  }

  const control1 = start
    .clone()
    .addScaledVector(direction, insetStart)
    .add(startBend);
  control1.z += startLift;

  const control2 = end
    .clone()
    .addScaledVector(direction, -insetEnd)
    .add(endBend);
  control2.z += endLift;

  const curve = new THREE.CubicBezierCurve3(start, control1, control2, end);
  const segments = Math.max(6, Math.ceil(distance / 0.05));
  return curve
    .getPoints(segments)
    .map<[number, number, number]>((point) => [point.x, point.y, point.z]);
}
