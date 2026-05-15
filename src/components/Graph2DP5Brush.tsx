import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import p5 from "p5";
// @ts-ignore
import * as brush from "../assets/p5brush";
import type { NodeT, EdgeT, EdgeLayoutSettings } from "../graph/GraphType";
import { calculateGraphBounds, buildEdgeCurvePoints } from "../graph/GraphUtils";
import { isHuaminNode } from "../graph/GraphLayout";
import { COLORS } from "../constants/colors";
import { getViewportTuning, type ViewportTuning } from "../utils/viewport";

/** Extra spacing between layout coordinates (positions only, not node radius). */
const LAYOUT_SPREAD = 1.38;

const DEBUG_POINTER =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).has("debugPointer") ||
      window.localStorage.getItem("vislab-debug-pointer") === "1"));
/** Larger value = more margin, graph occupies less of the canvas. */
const FIT_PADDING = 2.85;
/** Node disk size relative to layout scale (lower = less overlap). */
const NODE_RADIUS_FACTOR = 0.2;
/** Default p5.brush pen weight for advisor–student stems. */
const DEFAULT_STEM_WEIGHT = 0.95;

export type Graph2DP5BrushHandle = {
  exportPng: (filename?: string, scale?: number) => Promise<void>;
};

interface Graph2DP5BrushProps {
  nodes: NodeT[];
  edges: EdgeT[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  edgeSettings?: EdgeLayoutSettings;
  width?: number;
  height?: number;
  layoutSpread?: number;
  fitPadding?: number;
  onReady?: () => void;
}

type BrushSketchConfig = {
  nodes: NodeT[];
  edges: EdgeT[];
  edgeSettings?: EdgeLayoutSettings;
  width: number;
  height: number;
  layoutSpread: number;
  fitPadding: number;
  bounds: NonNullable<ReturnType<typeof calculateGraphBounds>>;
  pixelDensity: number;
  interactive: boolean;
  onSelect?: (index: number | null) => void;
  getSelected?: () => number | null;
  onFrameReady?: (redraw: () => void) => void;
  onReady?: () => void;
  isDisposed?: () => boolean;
};

type ViewTransform = {
  positionScale: number;
  radiusScale: number;
  offsetX: number;
  offsetY: number;
  nodeScale: number;
  nodeRadiusFloor: number;
  leafRadiusFloor: number;
  leafNodeScale: number;
};

function buildViewTransform(
  bounds: NonNullable<ReturnType<typeof calculateGraphBounds>>,
  width: number,
  height: number,
  layoutSpread: number,
  fitPadding: number
): ViewTransform {
  const positionScale = Math.min(width, height) / (bounds.radius * fitPadding);
  const radiusScale = positionScale * 0.78;
  const { nodeScale, nodeRadiusFloor, leafRadiusFloor, leafNodeScale } =
    getViewportTuning(width, height);
  return {
    positionScale,
    radiusScale,
    offsetX: -bounds.center.x * positionScale * layoutSpread,
    offsetY: -bounds.center.y * positionScale * layoutSpread,
    nodeScale,
    nodeRadiusFloor,
    leafRadiusFloor,
    leafNodeScale,
  };
}

function nodeScreenPosition(
  node: NodeT,
  view: ViewTransform,
  layoutSpread: number
): [number, number] {
  const spread = view.positionScale * layoutSpread;
  return [node.x * spread + view.offsetX, -(node.y * spread + view.offsetY)];
}

function nodeScreenRadius(node: NodeT, view: ViewTransform): number {
  const isLeaf = !isHuaminNode(node) && !node.isRoot && !node.isFaculty;
  const floor = isLeaf ? view.leafRadiusFloor : view.nodeRadiusFloor;
  let radius = Math.max(node.size * view.radiusScale * NODE_RADIUS_FACTOR, floor);
  if (isHuaminNode(node)) radius *= 5.2;
  else if (node.isRoot) radius *= 2.2;
  else if (node.isFaculty) radius *= 2.2;
  else radius *= view.leafNodeScale;
  return radius * view.nodeScale;
}

/** Hit area — watercolor bleed extends past the geometric disk. */
function nodeHitRadius(node: NodeT, view: ViewTransform): number {
  const visual = nodeScreenRadius(node, view);
  if (isHuaminNode(node)) return visual * 1.15;
  if (node.isRoot) return visual * 1.25;
  if (node.isFaculty) return visual * 1.35;
  return visual * 2.5;
}

/** Fallback pick slack — keep small so distant students don't steal hub clicks. */
const PICK_SLACK_PX = 22;

function pointerEventToWebgl(
  event: MouseEvent,
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const scaleX = logicalWidth / rect.width;
  const scaleY = logicalHeight / rect.height;

  // offsetX/Y are relative to the canvas itself — unaffected by ancestor padding/scroll.
  const localX =
    event.target === canvas ? event.offsetX : event.clientX - rect.left;
  const localY =
    event.target === canvas ? event.offsetY : event.clientY - rect.top;

  const px = localX * scaleX;
  const py = localY * scaleY;
  // Match p5.brush mask coords (Y-down + center offset), then shader vertical flip on composite.
  return [px - logicalWidth / 2, py - logicalHeight / 2];
}

type PointerProbe = {
  index: number;
  label: string;
  layoutX: number;
  layoutY: number;
  anchorX: number;
  anchorY: number;
  centerX: number;
  centerY: number;
  visualR: number;
  hitR: number;
  distAnchor: number;
  distCenter: number;
  inRange: boolean;
};

function probePointer(
  mx: number,
  my: number,
  nodes: NodeT[],
  view: ViewTransform,
  layoutSpread: number
): PointerProbe[] {
  return nodes
    .map((node, index) => {
      const [centerX, centerY] = nodeScreenPosition(node, view, layoutSpread);
      const anchorX = centerX;
      const anchorY = centerY;
      const visualR = nodeScreenRadius(node, view);
      const hitR = nodeHitRadius(node, view);
      const distCenter = Math.hypot(centerX - mx, centerY - my);
      return {
        index,
        label: node.label,
        layoutX: node.x,
        layoutY: node.y,
        anchorX,
        anchorY,
        centerX,
        centerY,
        visualR,
        hitR,
        distAnchor: Math.hypot(anchorX - mx, anchorY - my),
        distCenter,
        inRange: distCenter <= hitR,
      };
    })
    .sort((a, b) => a.distCenter - b.distCenter);
}

function nodePickPriority(node: NodeT): number {
  if (isHuaminNode(node)) return 0;
  if (node.isRoot) return 1;
  if (node.isFaculty) return 2;
  return 3;
}

function findNodeAtPointer(
  mx: number,
  my: number,
  nodes: NodeT[],
  view: ViewTransform,
  layoutSpread: number
): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPriority = Number.POSITIVE_INFINITY;

  const consider = (index: number, distance: number, maxDistance: number) => {
    if (distance > maxDistance) return;
    const priority = nodePickPriority(nodes[index]);
    if (
      distance < bestDistance - 0.5 ||
      (Math.abs(distance - bestDistance) <= 0.5 && priority < bestPriority)
    ) {
      bestDistance = distance;
      bestPriority = priority;
      bestIndex = index;
    }
  };

  nodes.forEach((node, index) => {
    const [cx, cy] = nodeScreenPosition(node, view, layoutSpread);
    const hitRadius = nodeHitRadius(node, view);
    consider(index, Math.hypot(cx - mx, cy - my), hitRadius);
  });

  if (bestIndex !== null) return bestIndex;

  nodes.forEach((node, index) => {
    const [cx, cy] = nodeScreenPosition(node, view, layoutSpread);
    consider(index, Math.hypot(cx - mx, cy - my), PICK_SLACK_PX);
  });

  return bestIndex;
}

function logPointerDebug(
  event: MouseEvent,
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  mx: number,
  my: number,
  selectedIndex: number | null,
  nodes: NodeT[],
  view: ViewTransform,
  layoutSpread: number
) {
  if (!DEBUG_POINTER) return;

  const rect = canvas.getBoundingClientRect();
  const probes = probePointer(mx, my, nodes, view, layoutSpread);
  const nearest = probes.slice(0, 8);
  const legacyMy = -my;
  const huaminIndex = nodes.findIndex((node) => isHuaminNode(node));
  const huaminProbe =
    huaminIndex >= 0
      ? probes.find((probe) => probe.index === huaminIndex) ??
        probePointer(mx, my, [nodes[huaminIndex]], view, layoutSpread)[0]
      : null;

  console.group("[VisLab pointer] click debug — copy this block if reporting issues");
  console.log("Enable always: localStorage.setItem('vislab-debug-pointer','1')");
  console.log("Disable: localStorage.removeItem('vislab-debug-pointer')");
  const usedOffset = event.target === canvas;
  console.table({
    clientX: event.clientX,
    clientY: event.clientY,
    offsetX: usedOffset ? event.offsetX : null,
    offsetY: usedOffset ? event.offsetY : null,
    canvasLeft: rect.left,
    canvasTop: rect.top,
    canvasWidth: rect.width,
    canvasHeight: rect.height,
    logicalWidth,
    logicalHeight,
    webglX: Math.round(mx),
    webglY: Math.round(my),
    webglYLegacy: Math.round(legacyMy),
    selectedIndex,
    selectedLabel: selectedIndex !== null ? nodes[selectedIndex]?.label : null,
    huaminDist: huaminProbe ? Math.round(huaminProbe.distCenter) : null,
    huaminHitR: huaminProbe ? Math.round(huaminProbe.hitR) : null,
    huaminInRange: huaminProbe?.inRange ?? null,
    huaminCenter: huaminProbe
      ? `${Math.round(huaminProbe.centerX)},${Math.round(huaminProbe.centerY)}`
      : null,
  });
  console.log("Nearest nodes (distCenter = distance to visible disk center):");
  console.table(
    nearest.map((n) => ({
      index: n.index,
      label: n.label,
      distCenter: Math.round(n.distCenter),
      distAnchor: Math.round(n.distAnchor),
      hitR: Math.round(n.hitR),
      inRange: n.inRange,
      center: `${Math.round(n.centerX)},${Math.round(n.centerY)}`,
    }))
  );
  console.log("Full JSON:", JSON.stringify({ mx, my, selectedIndex, nearest }, null, 2));
  console.groupEnd();
}

function applyOrtho(p: p5, width: number, height: number) {
  p.ortho(-width / 2, width / 2, -height / 2, height / 2, 0, Math.max(width, height) * 4);
}

function drawSelectionRingOutline(p: p5, x: number, y: number, radius: number) {
  const segments = 72;
  p.push();
  p.noFill();
  p.stroke(232, 74, 46);
  p.strokeWeight(2.5);
  p.beginShape();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * p.TWO_PI;
    p.vertex(x + radius * p.cos(angle), y + radius * p.sin(angle), 0);
  }
  p.endShape(p.CLOSE);
  p.stroke(255, 255, 255, 140);
  p.strokeWeight(1);
  p.beginShape();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * p.TWO_PI;
    p.vertex(x + radius * p.cos(angle), y + radius * p.sin(angle), 0);
  }
  p.endShape(p.CLOSE);
  p.pop();
}

/** Clip radius slightly outside the disk so stems stop before watercolor bleed. */
function stemClipRadius(node: NodeT, screenRadius: number): number {
  if (isHuaminNode(node)) return screenRadius * 1.02;
  if (node.isFaculty) return screenRadius * 1.06;
  if (node.isRoot) return screenRadius * 1.05;
  return screenRadius * 1.1;
}

function segmentCircleIntersection(
  from: [number, number],
  to: [number, number],
  center: [number, number],
  radius: number
): [number, number] | null {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const [cx, cy] = center;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const a = dx * dx + dy * dy;
  if (a < 1e-8) return null;

  const fx = x1 - cx;
  const fy = y1 - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  const candidates = [t1, t2].filter((t) => t >= 0 && t <= 1);
  if (!candidates.length) return null;
  const t = candidates.reduce((best, current) => (current < best ? current : best));
  return [x1 + t * dx, y1 + t * dy];
}

/** Remove polyline segments inside a disk (stems radiate from edge, not through center). */
function clipPolylineOutsideCircle(
  points: [number, number][],
  center: [number, number],
  radius: number
): [number, number][][] {
  if (points.length < 2) return [];

  const inside = (pt: [number, number]) =>
    Math.hypot(pt[0] - center[0], pt[1] - center[1]) < radius;

  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  const flush = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!inside(pt)) {
      if (i > 0 && inside(points[i - 1])) {
        const hit = segmentCircleIntersection(points[i - 1], pt, center, radius);
        if (hit) current.push(hit);
      }
      current.push(pt);
    } else if (current.length > 0) {
      const prev = current[current.length - 1];
      const hit = segmentCircleIntersection(prev, pt, center, radius);
      if (hit) current.push(hit);
      flush();
    }
  }
  flush();
  return segments;
}

function clipCurveAtBothNodes(
  points: [number, number][],
  sourcePos: [number, number],
  sourceClipR: number,
  targetPos: [number, number],
  targetClipR: number
): [number, number][][] {
  let segments: [number, number][][] = [points];
  segments = segments.flatMap((seg) =>
    clipPolylineOutsideCircle(seg, sourcePos, sourceClipR)
  );
  segments = segments.flatMap((seg) =>
    clipPolylineOutsideCircle(seg, targetPos, targetClipR)
  );

  return segments.filter((seg) => seg.length >= 2);
}

function nodeFillStyle(node: NodeT, selected: boolean): { color: string; layers: number } {
  if (selected) return { color: COLORS.SELECTED, layers: 320 };
  if (node.isRoot) return { color: COLORS.ROOT, layers: 280 };
  if (isHuaminNode(node)) return { color: COLORS.FACULTY, layers: 380 };
  if (node.isFaculty) return { color: COLORS.FACULTY, layers: 240 };
  return { color: COLORS.STUDENT, layers: 200 };
}

function formatVisLabDateLabel(date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function measureBrushTextWidth(
  font: p5.Font,
  text: string,
  fontSize: number,
  letterTracking: number
): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const bounds = font.textBounds(text[i], 0, 0, fontSize) as { w: number };
    width += bounds.w + (i < text.length - 1 ? letterTracking : 0);
  }
  return width;
}

function drawBrushText(
  font: p5.Font,
  text: string,
  startX: number,
  baselineY: number,
  fontSize: number,
  letterTracking: number
): number {
  brush.noField();
  brush.bleed(0.14);
  brush.set("HB", COLORS.TEXT_PRIMARY, 2.5);

  let letterX = startX;
  for (let i = 0; i < text.length; i++) {
    const token = text[i];
    const points = font.textToPoints(token, letterX, baselineY, fontSize, {
      sampleFactor: 0.28,
      simplifyThreshold: 0,
    });

    if (points.length >= 3) {
      brush.noStroke();
      brush.fill(COLORS.TEXT_PRIMARY, 50);
      brush.polygon(points.map(({ x, y }) => [x, y]));

      brush.noFill();
      brush.beginShape();
      points.forEach((point) => {
        brush.vertex(point.x, point.y, 0.62);
      });
      brush.endShape();
    }

    const bounds = font.textBounds(token, letterX, baselineY, fontSize) as { w: number };
    letterX += bounds.w + letterTracking;
  }

  return letterX - startX - letterTracking;
}

function drawVisLabLogo(
  font: p5.Font,
  canvasWidth: number,
  canvasHeight: number,
  tuning: ViewportTuning
) {
  const word = "VisLab";
  const wordSize = 96 * tuning.logoScale;
  const letterTracking = 5 * tuning.logoScale;
  const dateSize = wordSize * 0.45;
  const dateTracking = 4 * tuning.logoScale;
  const dateLabel = formatVisLabDateLabel();

  // Scene blit flips Y — anchor from canvas top (+Y) to land near the screen bottom.
  const textStartY =
    tuning.logoPlacement === "top-left"
      ? canvasHeight / 2 - tuning.logoMarginY * tuning.logoInsetScale
      : canvasHeight / 2 - tuning.logoMarginY;

  const vislabWidth = measureBrushTextWidth(font, word, wordSize, letterTracking);
  const dateWidth = measureBrushTextWidth(font, dateLabel, dateSize, dateTracking);

  let textStartX: number;
  if (tuning.logoPlacement === "bottom-center") {
    textStartX = -vislabWidth / 2;
  } else if (tuning.logoPlacement === "bottom-left") {
    textStartX = -canvasWidth / 2 + tuning.logoMarginX;
  } else {
    textStartX = -canvasWidth / 2 + tuning.logoMarginX * tuning.logoInsetScale;
  }

  drawBrushText(font, word, textStartX, textStartY, wordSize, letterTracking);

  const dateStartX =
    tuning.logoPlacement === "bottom-center"
      ? -dateWidth / 2
      : tuning.logoPlacement === "bottom-left"
        ? textStartX
        : textStartX + vislabWidth / 2 - dateWidth / 2;
  const dateStartY = textStartY + wordSize * 0.62;

  drawBrushText(font, dateLabel, dateStartX, dateStartY, dateSize, dateTracking);
}

function createBrushGraphSketch({
  nodes,
  edges,
  edgeSettings,
  width,
  height,
  layoutSpread,
  fitPadding,
  bounds,
  pixelDensity,
  interactive,
  onSelect,
  getSelected,
  onFrameReady,
  onReady,
  isDisposed,
}: BrushSketchConfig) {
  return (p: p5) => {
    let font: p5.Font;
    let isReady = false;
    let sceneImage: p5.Image | null = null;
    let canvasW = width;
    let canvasH = height;
    let view = buildViewTransform(bounds, canvasW, canvasH, layoutSpread, fitPadding);
    let viewportTuning = getViewportTuning(canvasW, canvasH);
    let canvasElement: HTMLCanvasElement | null = null;
    let overlayRegistered = false;
    const pendingRafs: number[] = [];

    const blitSceneImage = () => {
      if (!sceneImage) return;
      p.push();
      p.imageMode(p.CENTER);
      p.texture(sceneImage);
      p.noStroke();
      p.plane(canvasW, canvasH);
      p.pop();
    };

    /** Blit cached scene + selection ring only (no brush — avoids logo re-paint jitter). */
    const paintOverlayFrame = () => {
      if (!sceneImage) return;
      applyOrtho(p, canvasW, canvasH);
      p.resetShader();
      p.background(COLORS.BACKGROUND);
      blitSceneImage();

      const selectedIndex = getSelected?.() ?? null;
      if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < nodes.length) {
        const node = nodes[selectedIndex];
        const [cx, cy] = nodeScreenPosition(node, view, layoutSpread);
        const radius = nodeScreenRadius(node, view);
        drawSelectionRingOutline(p, cx, cy, radius);
      }
    };

    const registerOverlayPostOnce = () => {
      if (overlayRegistered) return;
      overlayRegistered = true;
      (p as p5 & { registerMethod: (name: string, fn: () => void) => void }).registerMethod(
        "post",
        paintOverlayFrame
      );
    };

    p.preload = () => {
      font = p.loadFont(`${import.meta.env.BASE_URL}fonts/Ubuntu-R.ttf`);
    };

    const handleCanvasClick =
      interactive && onSelect
        ? (event: MouseEvent) => {
            if (!isReady || !canvasElement) return;
            const [mx, my] = pointerEventToWebgl(event, canvasElement, canvasW, canvasH);
            const picked = findNodeAtPointer(mx, my, nodes, view, layoutSpread);
            logPointerDebug(
              event,
              canvasElement,
              canvasW,
              canvasH,
              mx,
              my,
              picked,
              nodes,
              view,
              layoutSpread
            );
            onSelect(picked);
          }
        : null;

    brush.instance(p);

    const paintScene = () => {
      applyOrtho(p, canvasW, canvasH);
      p.clear();
      p.background(COLORS.BACKGROUND);
      brush.load();
      brush.colorCache(true);
      brush.scaleBrushes(1.0);

      const plantEdgeSettings: EdgeLayoutSettings = {
        curvatureMin: 0.025,
        curvatureMax: 0.18,
        lengthForFullCurve: 1.5,
        startInsetScale: 1.2,
        endInsetScale: 1.2,
        planarSpiralStrength: 2.2,
        ...edgeSettings,
      };

      brush.noField();
      brush.set(
        "pen",
        COLORS.EDGE,
        viewportTuning.stemWeight ??
          plantEdgeSettings.stemWeight ??
          DEFAULT_STEM_WEIGHT
      );
      const spread = view.positionScale * layoutSpread;
      edges.forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        const sourcePos = nodeScreenPosition(sourceNode, view, layoutSpread);
        const targetPos = nodeScreenPosition(targetNode, view, layoutSpread);
        const sourceRadius = nodeScreenRadius(sourceNode, view);
        const targetRadius = nodeScreenRadius(targetNode, view);
        const sourceClipR = stemClipRadius(sourceNode, sourceRadius);
        const targetClipR = stemClipRadius(targetNode, targetRadius);

        const curvePoints3D = buildEdgeCurvePoints(
          sourceNode,
          targetNode,
          plantEdgeSettings,
          sourceNode.edgeOverride
        );
        const curvePoints = curvePoints3D.map(([x, y]) => [
          x * spread + view.offsetX,
          -(y * spread + view.offsetY),
        ]) as [number, number][];

        const segments = clipCurveAtBothNodes(
          curvePoints,
          sourcePos,
          sourceClipR,
          targetPos,
          targetClipR
        );

        segments.forEach((segment) => {
          if (segment.length >= 2) brush.spline(segment, 2);
        });
      });

      const drawNode = (node: NodeT) => {
        const [x, y] = nodeScreenPosition(node, view, layoutSpread);
        const nodeRadius = nodeScreenRadius(node, view);
        const { color, layers } = nodeFillStyle(node, false);
        brush.noField();
        brush.noStroke();
        brush.bleed(isHuaminNode(node) ? 0.09 : 0.1);
        brush.fill(color, layers);
        brush.circle(x, y, nodeRadius, false);
      };
      nodes.forEach((node) => {
        if (isHuaminNode(node)) return;
        drawNode(node);
      });
      nodes.forEach((node) => {
        if (!isHuaminNode(node)) return;
        drawNode(node);
      });

      if (font) {
        drawVisLabLogo(font, canvasW, canvasH, viewportTuning);
      }
    };

    const captureScene = () => {
      if (isDisposed?.()) return;
      brush.reBlend();
      sceneImage = p.get() as p5.Image;
      isReady = true;
      p.noLoop();
      onReady?.();
      onFrameReady?.(() => p.redraw());
      paintOverlayFrame();
      registerOverlayPostOnce();

      if (handleCanvasClick && canvasElement) {
        canvasElement.removeEventListener("click", handleCanvasClick);
        canvasElement.addEventListener("click", handleCanvasClick);
      }
    };

    const scheduleCapture = () => {
      pendingRafs.forEach((id) => cancelAnimationFrame(id));
      pendingRafs.length = 0;
      pendingRafs.push(
        requestAnimationFrame(() => {
          pendingRafs.push(
            requestAnimationFrame(() => {
              pendingRafs.push(requestAnimationFrame(captureScene));
            })
          );
        })
      );
    };

    p.setup = () => {
      p.setAttributes("preserveDrawingBuffer", true);
      const canvas = p.createCanvas(canvasW, canvasH, p.WEBGL);
      canvasElement = canvas.elt;
      p.pixelDensity(pixelDensity);
      p.smooth();
      canvas.elt.style.display = "block";
      canvas.elt.style.margin = "0";
      canvas.elt.style.width = "100%";
      canvas.elt.style.height = "100%";
      canvas.elt.style.backgroundColor = "transparent";
      canvas.elt.style.imageRendering = "auto";

      paintScene();
      scheduleCapture();

      const originalRemove = p.remove.bind(p);
      p.remove = () => {
        pendingRafs.forEach((id) => cancelAnimationFrame(id));
        pendingRafs.length = 0;
        if (handleCanvasClick) {
          canvasElement?.removeEventListener("click", handleCanvasClick);
        }
        originalRemove();
      };
    };

    p.draw = () => {
      // Intentionally empty until captureScene assigns paintOverlayFrame.
    };
  };
}

function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("PNG export timed out"));
    }, 30_000);

    canvas.toBlob(
      (blob) => {
        window.clearTimeout(timeout);
        if (!blob) {
          reject(new Error("Failed to export PNG"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/png",
      1
    );
  });
}

async function exportVisibleCanvasPng(
  container: HTMLElement,
  filename: string,
  upscale = 1
): Promise<void> {
  const source = container.querySelector("canvas");
  if (!source) throw new Error("Canvas not found");

  const gl = source.getContext("webgl2") || source.getContext("webgl");
  gl?.finish();

  if (upscale <= 1) {
    await downloadCanvasPng(source, filename);
    return;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.round(source.width * upscale);
  exportCanvas.height = Math.round(source.height * upscale);
  const ctx = exportCanvas.getContext("2d");
  if (!ctx) throw new Error("Could not create export surface");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  ctx.drawImage(source, 0, 0, exportCanvas.width, exportCanvas.height);
  await downloadCanvasPng(exportCanvas, filename);
}

export const Graph2DP5Brush = forwardRef<Graph2DP5BrushHandle, Graph2DP5BrushProps>(
  function Graph2DP5Brush(
    {
      nodes,
      edges,
      selected,
      onSelect,
      edgeSettings,
      width = 1200,
      height = 1300,
      layoutSpread = LAYOUT_SPREAD,
      fitPadding = FIT_PADDING,
      onReady,
    },
    ref
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const redrawFrameRef = useRef<(() => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const onReadyRef = useRef(onReady);
  onSelectRef.current = onSelect;
  selectedRef.current = selected;
  onReadyRef.current = onReady;

  useImperativeHandle(
    ref,
    () => ({
      exportPng: async (filename = "vislab-family-tree.png", upscale = 1) => {
        const p = p5InstanceRef.current;
        const container = containerRef.current;
        if (!p || !container) {
          throw new Error("Graph is not ready yet — wait for it to finish loading.");
        }

        if (upscale <= 1) {
          const base = filename.replace(/\.png$/i, "");
          p.saveCanvas(base, "png");
          return;
        }

        await exportVisibleCanvasPng(container, filename, upscale);
      },
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const bounds = calculateGraphBounds(nodes.map((node) => ({ ...node, z: 0 })));
    if (!bounds) return;

    let disposed = false;

    const sketch = createBrushGraphSketch({
      nodes,
      edges,
      edgeSettings,
      width,
      height,
      layoutSpread,
      fitPadding,
      bounds,
      pixelDensity: 2,
      interactive: true,
      onSelect: (index) => onSelectRef.current(index),
      getSelected: () => selectedRef.current,
      onFrameReady: (redraw) => {
        redrawFrameRef.current = redraw;
      },
      onReady: () => {
        if (!disposed) onReadyRef.current?.();
      },
      isDisposed: () => disposed,
    });

    p5InstanceRef.current = new p5(sketch, containerRef.current);

    return () => {
      disposed = true;
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
      redrawFrameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pixel size fixed; display scales via CSS
  }, [nodes, edges, edgeSettings, layoutSpread, fitPadding, width, height]);

  useEffect(() => {
    redrawFrameRef.current?.();
  }, [selected]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "transparent",
        overflow: "hidden",
        imageRendering: "auto",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    />
  );
});
