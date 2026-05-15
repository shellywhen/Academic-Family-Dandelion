import type {
  GraphBuildOptions,
  GraphDataset,
  GraphStructure,
  GraphT,
  NodeT,
  SimplePosition,
  OrientationSign,
  SpecialCaseKey,
  LayoutSettings,
  SpecialCaseLayoutConfig,
  ChildSectorOverride,
  NodeLayoutCase,
  EdgeCurveOverride,
  LayoutEntry,
  EdgeT,
} from "./GraphType";
import { isFacultyCareer } from "./careerUtils";
import { clamp, spanBetween, wrapAngle } from "./GraphUtils";

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const INTERNAL_NODE_SIZE = 0.016;
const LEAF_NODE_SIZE = 0.012;
const ROOT_NODE_SIZE = 0.028;

export const LABEL_SETTINGS = {
  baseOffset: 0.01,
  parentOffset: 0.015,
  baseFontSize: 0.024,
  parentFontSize: 0.024,
  huaminFontSize: 0.048,
  baseOutlineWidth: 0,
  parentOutlineWidth: 0.0001,
  labelColor: "#1a1a1a",
};

export const LABEL_Z_OFFSET = 0.0001;
export const DEFAULT_COLORS = {
  root: "#ff6d05",
  faculty: "#97ff05",
  student: "#ffeb03",
  highlight: "#ff6d05",
  edge: "#a0a0a0",
};

const ARIE_NAME = "Arie Kaufman";
const HUAMIN_NAME = "Huamin Qu";
const YINGCAI_NAME = "Yingcai Wu";
const NAN_NAME = "Nan Cao";
const SIWEI_NAME = "Siwei Fu";
const YONG_NAME = "Yong Wang";
const QING_NAME = "Qing Chen";
const QUAN_NAME = "Quan Li";
const DONGYU_NAME = "Dongyu Liu";

const FACULTY_SPECIAL_CASE = "category:faculty" as const;
const HAS_CHILDREN_SPECIAL_CASE = "category:has-children" as const;
const HUAMIN_NAME_LOWER = HUAMIN_NAME.toLowerCase();

export function isHuaminLabel(label: string | undefined): boolean {
  return (label ?? "").toLowerCase() === HUAMIN_NAME_LOWER;
}

export function isHuaminNode<T extends { label: string }>(node: T): boolean {
  return isHuaminLabel(node.label);
}

function normalizeSpecialCaseKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().toLowerCase();
}

const SPECIAL_CASE_DEFINITIONS: Record<string, SpecialCaseLayoutConfig> = {
  [ARIE_NAME]: {
    child: {
      startDegree: 290,
    },
    edge: {
      curvature: 0.1,
      lift: 0,
    },
  },
  [HUAMIN_NAME]: {
    child: {
      startDegree: 320,
      spanDegree: 310,
    },
    node: {
      distanceOffset: -0.08,
    },
    edge: {
      curvature: 0.08,
    },
  },
  [YINGCAI_NAME]: {
    child: {
      startDegree: 270,
      spanDegree: 220,
    },
    node: {
      degreeOffset: -15,
      weightScale: 0.5,
    },
  },
  [NAN_NAME]: {
    child: {
      startDegree: 330,
      spanDegree: 140,
    },
    node: {
      degreeOffset: -5,
      weightScale: 0.5,
    },
  },
  [SIWEI_NAME]: {
    child: {
      startDegree: 35,
    },
  },
  [YONG_NAME]: {
    child: {
      startDegree: 30,
      spanDegree: 60,
    },
  },
  [QING_NAME]: {
    child: {
      startDegree: 64,
    },
  },
  [QUAN_NAME]: {
    child: {
      startDegree: 60,
    },
  },
  [DONGYU_NAME]: {
    child: {
      startDegree: 82,
    },
  },
};

const SPECIAL_CASES: Record<SpecialCaseKey, SpecialCaseLayoutConfig> =
  Object.fromEntries(
    Object.entries(SPECIAL_CASE_DEFINITIONS)
      .map<[SpecialCaseKey, SpecialCaseLayoutConfig] | null>(
        ([key, value]) => {
          const normalized = normalizeSpecialCaseKey(key);
          return normalized ? [normalized, value] : null;
        }
      )
      .filter((entry): entry is [SpecialCaseKey, SpecialCaseLayoutConfig] =>
        Boolean(entry)
      )
  );

export const LAYOUT_SETTINGS: LayoutSettings = {
  orientation: 1,
  node: {
    distances: [
      GOLDEN_RATIO,
      1 / GOLDEN_RATIO,
      1 / (GOLDEN_RATIO * GOLDEN_RATIO * GOLDEN_RATIO),
      1 /
        (GOLDEN_RATIO * GOLDEN_RATIO * GOLDEN_RATIO * GOLDEN_RATIO) +
        0.04,
    ],
    distanceOffset: 0.08,
    verticalOffset: 0.04,
  },
  edge: {
    curvatureMin: 0.012,
    curvatureMax: 0.11,
    lengthForFullCurve: 1.2,
    startInsetScale: 1.0,
    endInsetScale: 1.0,
    planarSpiralStrength: 1.8,
    stemWeight: 0.95,
    lift: 0,
  },
  child: {
    perDepth: [
      { perChildDegree: 0, spanDegreeMin: 0, spanDegreeMax: 0 },
      { perChildDegree: 0, spanDegreeMin: 0, spanDegreeMax: 0 },
      { perChildDegree: 0, spanDegreeMin: 0, spanDegreeMax: 0 },
      {
        perChildDegree: 10,
        spanDegreeMin: 8,
        spanDegreeMax: 240,
      },
      {
        perChildDegree: 10,
        spanDegreeMin: 20,
        spanDegreeMax: 240,
      },
    ],
    gap: {
      base: 0.08,
      falloff: 0.55,
      max: 0.18,
    },
  },
  specialCases: SPECIAL_CASES,
};

function createLayoutSettings(options?: GraphBuildOptions): LayoutSettings {
  const orientation = options?.orientation ?? LAYOUT_SETTINGS.orientation;
  return {
    ...LAYOUT_SETTINGS,
    orientation,
    edge: { ...LAYOUT_SETTINGS.edge },
  };
}

function createBaselineLayout(settings: LayoutSettings): LayoutSettings {
  return {
    ...settings,
    specialCases: {} as Record<SpecialCaseKey, SpecialCaseLayoutConfig>,
  };
}

function mergeSimplePositions(scenicNodes: NodeT[], baselineNodes: NodeT[]): NodeT[] {
  const baselineMap = new Map(
    baselineNodes.map((node) => [node.id, node] as const)
  );

  return scenicNodes.map((node) => {
    const fallback = baselineMap.get(node.id);
    const anchor =
      node.isRoot || isHuaminLabel(node.label) ? node : fallback ?? node;
    const simplePosition: SimplePosition = {
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
    };
    return { ...node, simplePosition };
  });
}

export function buildGraphLayout(
  dataset: GraphDataset,
  options?: GraphBuildOptions
): GraphT {
  const layoutSettings = createLayoutSettings(options);
  if (!dataset.nodes.length) {
    return { nodes: [], edges: [], edgeSettings: layoutSettings.edge };
  }

  const baseLayoutSettings = createBaselineLayout(layoutSettings);
  const structure = prepareGraphStructure(dataset);

  const scenicNodes = buildNodes(
    computeBloomLayout(structure, layoutSettings),
    structure,
    layoutSettings
  );
  const baselineNodes = buildNodes(
    computeBloomLayout(structure, baseLayoutSettings),
    structure,
    baseLayoutSettings
  );

  const nodes = mergeSimplePositions(scenicNodes, baselineNodes);
  const edges = buildEdges(structure);

  return { nodes, edges, edgeSettings: layoutSettings.edge };
}

function prepareGraphStructure(dataset: GraphDataset): GraphStructure {
  const nodes = new Map<string, NodeT>();
  const children = new Map<string, string[]>();

  dataset.nodes.forEach((baseNode, index) => {
    const node: NodeT = {
      id: baseNode.id,
      label: baseNode.label,
      subtitle: baseNode.subtitle,
      advisorId: baseNode.advisorId,
      isRoot: baseNode.isRoot,
      isFaculty: baseNode.isFaculty,
      hasChildren: false,
      x: 0,
      y: 0,
      z: 0,
      angle: 0,
      radius: 0,
      depth: 0,
      radialFromParent: 0,
      baseRadialFromParent: 0,
      bumpFromParent: 0,
      size: 0,
      color: baseNode.isRoot
        ? DEFAULT_COLORS.root
        : baseNode.isFaculty
          ? DEFAULT_COLORS.faculty
          : DEFAULT_COLORS.student,
      simplePosition: undefined,
      inputOrder: index,
      edgeOverride: undefined,
      details: { ...baseNode.details },
    };
    nodes.set(node.id, node);
    children.set(node.id, []);
  });

  dataset.edges.forEach(({ source, target }) => {
    const parent = nodes.get(source);
    const child = nodes.get(target);
    if (!parent || !child) return;
    parent.hasChildren = true;
    const list = children.get(parent.id);
    if (list) {
      if (!list.includes(child.id)) {
        list.push(child.id);
      }
    } else {
      children.set(parent.id, [child.id]);
    }
    child.advisorId = parent.id;
    child.details = { ...child.details, advisor: parent.label };
  });

  nodes.forEach((_node, id) => {
    const list = children.get(id);
    if (!list) {
      children.set(id, []);
      return;
    }
    const unique = Array.from(new Set(list.filter((childId) => childId !== id)));
    children.set(id, unique);
  });

  let rootId =
    dataset.nodes.find((node) => node.isRoot)?.id ??
    dataset.nodes.find((node) => !node.advisorId)?.id ??
    dataset.nodes[0]?.id ??
    "";

  if (rootId && nodes.has(rootId)) {
    const root = nodes.get(rootId)!;
    root.isRoot = true;
    root.color = DEFAULT_COLORS.root;
  }

  return { nodes, children, rootId };
}

function computeBloomLayout(
  structure: GraphStructure,
  settings: LayoutSettings
): Map<string, LayoutEntry> {
  const weights = new Map<string, number>();
  computeWeights(structure.rootId, structure, new Set(), weights);
  sortSubtree(structure.rootId, structure);

  const layout = new Map<string, LayoutEntry>();
  const visited = new Set<string>();

  const rootEntry: LayoutEntry = {
    angle: 0,
    radius: 0,
    x: 0,
    y: 0,
    depth: 0,
    sectorStart: 0,
    sectorEnd: 0,
    localRadius: 0,
    baseRadius: 0,
  };
  layout.set(structure.rootId, rootEntry);
  visited.add(structure.rootId);

  const rootChildren = structure.children.get(structure.rootId) ?? [];
  if (rootChildren.length) {
    const rootSector = computeChildSector(
      structure.rootId,
      rootEntry,
      structure,
      settings
    );
    rootEntry.sectorStart = rootSector.start;
    rootEntry.sectorEnd = rootSector.end;
    placeChildrenInArc(
      rootChildren,
      rootEntry,
      layout,
      visited,
      rootSector.start,
      rootSector.end,
      rootSector.orientation,
      structure,
      weights,
      settings
    );
  }

  structure.nodes.forEach((_node, id) => {
    if (layout.has(id)) return;
    layout.set(id, {
      angle: 0,
      radius: 0,
      x: 0,
      y: 0,
      depth: 0,
      sectorStart: 0,
      sectorEnd: 0,
      localRadius: 0,
      baseRadius: 0,
    });
  });

  return layout;
}

function computeWeights(
  nodeId: string,
  structure: GraphStructure,
  visiting: Set<string>,
  weights: Map<string, number>
): number {
  if (visiting.has(nodeId)) {
    return weights.get(nodeId) ?? 0;
  }

  const cached = weights.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }

  visiting.add(nodeId);

  const childIds = structure.children.get(nodeId) ?? [];
  let weight = 1;
  if (childIds.length > 0) {
    let total = 0;
    childIds.forEach((childId) => {
      total += computeWeights(childId, structure, visiting, weights);
    });
    weight = total > 0 ? total : 1;
  }

  visiting.delete(nodeId);
  weights.set(nodeId, weight);
  return weight;
}

function sortSubtree(nodeId: string, structure: GraphStructure) {
  const childIds = structure.children.get(nodeId);
  if (!childIds || childIds.length === 0) return;
  childIds.sort((a, b) =>
    compareNodes(structure.nodes.get(a), structure.nodes.get(b))
  );
  childIds.forEach((childId) => sortSubtree(childId, structure));
}

function compareNodes(a?: NodeT, b?: NodeT): number {
  const orderA = a?.inputOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b?.inputOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return 0;
}

function placeChildren(
  nodeId: string,
  entry: LayoutEntry,
  layout: Map<string, LayoutEntry>,
  visited: Set<string>,
  structure: GraphStructure,
  weights: Map<string, number>,
  settings: LayoutSettings
) {
  const childIds = structure.children.get(nodeId) ?? [];
  if (!childIds.length) return;
  const sector = computeChildSector(nodeId, entry, structure, settings);
  placeChildrenInArc(
    childIds,
    entry,
    layout,
    visited,
    sector.start,
    sector.end,
    sector.orientation,
    structure,
    weights,
    settings
  );
}

function placeChildrenInArc(
  childIds: string[],
  parentEntry: LayoutEntry,
  layout: Map<string, LayoutEntry>,
  visited: Set<string>,
  arcStart: number,
  arcEnd: number,
  orientation: OrientationSign,
  structure: GraphStructure,
  weights: Map<string, number>,
  settings: LayoutSettings
) {
  if (!childIds.length) return;

  const normalizedStart = wrapAngle(arcStart);
  const normalizedEnd = wrapAngle(arcEnd);
  const span = spanBetween(normalizedStart, normalizedEnd);
  if (span <= 0) return;

  const ordered = childIds.slice();

  const scaledWeights = ordered.map((childId) =>
    computeScaledSectorWeight(childId, structure, weights, settings)
  );
  const totalWeight = scaledWeights.reduce((sum, weight) => sum + weight, 0);
  const childCount = ordered.length;
  const gapRatio = gapRatioForDepth(parentEntry.depth, childCount, settings);
  const totalGap = childCount > 1 ? gapRatio * span : 0;
  const gap = childCount > 1 ? totalGap / (childCount - 1) : 0;
  const usableSpan = span - totalGap;

  const direction = orientation === 1 ? 1 : -1;
  let cursor = normalizedStart;

  ordered.forEach((childId, index) => {
    const scaledWeight = scaledWeights[index];
    const share = totalWeight > 0 ? scaledWeight / totalWeight : 1 / childCount;
    const childSpan = usableSpan * share;
    const segmentStart = cursor;
    const segmentEnd = cursor + direction * childSpan;
    const entry = placeChildNode(
      childId,
      parentEntry,
      segmentStart,
      segmentEnd,
      layout,
      visited,
      structure,
      settings
    );
    placeChildren(
      childId,
      entry,
      layout,
      visited,
      structure,
      weights,
      settings
    );
    cursor = segmentEnd + direction * gap;
  });
}

function computeScaledSectorWeight(
  nodeId: string,
  structure: GraphStructure,
  weights: Map<string, number>,
  settings: LayoutSettings
): number {
  const baseWeight = weights.get(nodeId) ?? 0;
  if (baseWeight <= 0) {
    return 0;
  }

  const config = getSpecialCaseConfigForNode(nodeId, structure, settings);
  const scale = config?.node?.weightScale ?? 1;
  return baseWeight * scale;
}

function placeChildNode(
  childId: string,
  parentEntry: LayoutEntry,
  theta0: number,
  theta1: number,
  layout: Map<string, LayoutEntry>,
  visited: Set<string>,
  structure: GraphStructure,
  settings: LayoutSettings
): LayoutEntry {
  if (visited.has(childId)) {
    return layout.get(childId)!;
  }

  let angle = wrapAngle((theta0 + theta1) / 2);
  const childDepth = parentEntry.depth + 1;
  const specialCaseConfig = getSpecialCaseConfigForNode(
    childId,
    structure,
    settings
  );

  let baseRadius = 0;
  let localRadius = 0;
  let directionAngle = angle;

  baseRadius = radialDistanceForDepth(childDepth, settings);

  const childCount = structure.children.get(childId)?.length ?? 0;
  const bump = childCount ? settings.node.distanceOffset : 0;
  localRadius = baseRadius + bump;

  const nodeOverride = specialCaseConfig?.node;
  if (nodeOverride?.distance !== undefined) {
    baseRadius = nodeOverride.distance;
    localRadius = nodeOverride.distance;
  }

  if (nodeOverride?.distanceOffset !== undefined) {
    baseRadius += nodeOverride.distanceOffset;
    localRadius += nodeOverride.distanceOffset;
  }

  if (nodeOverride?.degreeOffset !== undefined) {
    const delta = degrees(nodeOverride.degreeOffset);
    directionAngle = wrapAngle(directionAngle + delta);
    angle = wrapAngle(angle + delta);
  }

  baseRadius = Math.max(baseRadius, 0);
  localRadius = Math.max(localRadius, 0);

  const dirX = Math.cos(directionAngle);
  const dirY = Math.sin(directionAngle);
  const x = parentEntry.x + localRadius * dirX;
  const y = parentEntry.y + localRadius * dirY;
  angle = wrapAngle(directionAngle);

  const entry: LayoutEntry = {
    angle,
    radius: Math.hypot(x, y),
    x,
    y,
    depth: childDepth,
    sectorStart: angle,
    sectorEnd: angle,
    localRadius,
    baseRadius,
  };

  const sector = computeChildSector(childId, entry, structure, settings);
  entry.sectorStart = sector.start;
  entry.sectorEnd = sector.end;

  layout.set(childId, entry);
  visited.add(childId);
  return entry;
}

function computeChildSector(
  nodeId: string,
  entry: LayoutEntry,
  structure: GraphStructure,
  settings: LayoutSettings
): { start: number; end: number; orientation: OrientationSign } {
  const childIds = structure.children.get(nodeId) ?? [];
  if (!childIds.length) {
    const defaultOrientation = settings.orientation;
    return {
      start: entry.angle,
      end: entry.angle,
      orientation: defaultOrientation,
    };
  }

  const nodeConfig = getSpecialCaseConfigForNode(nodeId, structure, settings);
  const childDepth = entry.depth + 1;
  const childOverride = nodeConfig?.child;
  const span =
    childOverride?.spanDegree !== undefined
      ? degrees(childOverride.spanDegree)
      : childSectorSpan(childDepth, childIds.length, settings, childOverride);

  const orientation = childOverride?.orientation ?? settings.orientation;

  const startOverride = childOverride?.startDegree;
  if (startOverride !== undefined) {
    const start = degrees(startOverride);
    const end = orientation === 1 ? start + span : start - span;
    return { start, end, orientation };
  }

  const half = span / 2;
  if (orientation === 1) {
    return {
      start: entry.angle - half,
      end: entry.angle + half,
      orientation,
    };
  }
  return {
    start: entry.angle + half,
    end: entry.angle - half,
    orientation,
  };
}

function radialDistanceForDepth(
  depth: number,
  settings: LayoutSettings
): number {
  if (depth <= 0) return 0;
  const distances = settings.node.distances;
  if (!distances.length) return 0;
  const index = Math.min(depth - 1, distances.length - 1);
  return distances[index];
}

function degrees(value: number): number {
  return (Math.PI / 180) * value;
}

function childSectorSpan(
  depth: number,
  childCount: number,
  settings: LayoutSettings,
  override?: ChildSectorOverride
): number {
  const specs = settings.child.perDepth;
  const index = Math.min(depth, Math.max(specs.length - 1, 0));
  const baseSpec = specs[index] ?? specs[specs.length - 1];
  const count = Math.max(childCount, 1);
  const perChildDegree =
    override?.perChildDegree ?? baseSpec?.perChildDegree ?? 0;
  const baseSpan = perChildDegree * count;
  const minSpan = override?.spanDegreeMin ?? baseSpec?.spanDegreeMin ?? 0;
  const maxSpanCandidate = override?.spanDegreeMax ?? baseSpec?.spanDegreeMax;
  const maxSpan =
    maxSpanCandidate !== undefined
      ? Math.max(maxSpanCandidate, minSpan)
      : Math.max(baseSpan, minSpan);
  const spanDeg = clamp(baseSpan, minSpan, maxSpan);
  return degrees(spanDeg);
}

function getSpecialCaseConfigForNode(
  nodeId: string,
  structure: GraphStructure,
  settings: LayoutSettings
): SpecialCaseLayoutConfig | undefined {
  const keys = collectSpecialCaseKeys(nodeId, structure, settings);
  if (!keys.length) {
    return undefined;
  }

  let nodeCase: NodeLayoutCase | undefined;
  let childCase: ChildSectorOverride | undefined;
  let edgeCase: EdgeCurveOverride | undefined;

  keys.forEach((key) => {
    const config = settings.specialCases[key];
    if (!config) return;
    if (config.node) {
      nodeCase = nodeCase ? { ...nodeCase, ...config.node } : { ...config.node };
    }
    if (config.child) {
      childCase = childCase
        ? { ...childCase, ...config.child }
        : { ...config.child };
    }
    if (config.edge) {
      edgeCase = edgeCase ? { ...edgeCase, ...config.edge } : { ...config.edge };
    }
  });

  if (!nodeCase && !childCase && !edgeCase) {
    return undefined;
  }

  return { node: nodeCase, child: childCase, edge: edgeCase };
}

function collectSpecialCaseKeys(
  nodeId: string,
  structure: GraphStructure,
  settings: LayoutSettings
): SpecialCaseKey[] {
  const node = structure.nodes.get(nodeId);
  if (!node) return [];

  const keys: SpecialCaseKey[] = [];
  const seen = new Set<SpecialCaseKey>();
  const pushKey = (rawKey: string | undefined) => {
    const normalized = normalizeSpecialCaseKey(rawKey);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    if (!settings.specialCases[normalized]) return;
    keys.push(normalized);
    seen.add(normalized);
  };

  if (node.isFaculty) {
    pushKey(FACULTY_SPECIAL_CASE);
  }

  const childCount = structure.children.get(nodeId)?.length ?? 0;
  if (childCount > 0) {
    pushKey(HAS_CHILDREN_SPECIAL_CASE);
  }

  pushKey(node.label);

  return keys;
}

function gapRatioForDepth(
  depth: number,
  childCount: number,
  settings: LayoutSettings
): number {
  if (childCount <= 1) return 0;
  const { base, falloff, max } = settings.child.gap;
  const scaled = base * Math.pow(falloff, depth);
  return clamp(scaled, 0, max);
}

function buildNodes(
  layout: Map<string, LayoutEntry>,
  structure: GraphStructure,
  settings: LayoutSettings
): NodeT[] {
  const nodes: NodeT[] = [];

  layout.forEach((position, id) => {
    const base = structure.nodes.get(id);
    const childCount = structure.children.get(id)?.length ?? 0;
    const hasChildren = childCount > 0;
    const isRoot = id === structure.rootId;
    const isFaculty = isFacultyCareer(base?.details.career);

    const specialCase = getSpecialCaseConfigForNode(id, structure, settings);
    const nodeOverride = specialCase?.node;
    const verticalOffset =
      nodeOverride?.verticalOffset ?? settings.node.verticalOffset;
    const z =
      -Math.pow(GOLDEN_RATIO, 1 - position.depth) +
      (hasChildren ? verticalOffset : 0);
    const bumpFromParent = position.localRadius - position.baseRadius;

    const size = isRoot
      ? ROOT_NODE_SIZE
      : hasChildren
        ? INTERNAL_NODE_SIZE
        : LEAF_NODE_SIZE;
    const color = isRoot
      ? DEFAULT_COLORS.root
      : isFaculty
        ? DEFAULT_COLORS.faculty
        : DEFAULT_COLORS.student;

    nodes.push({
      id,
      x: position.x,
      y: position.y,
      z,
      angle: position.angle,
      radius: position.radius,
      depth: position.depth,
      radialFromParent: position.localRadius,
      baseRadialFromParent: position.baseRadius,
      bumpFromParent,
      size,
      color,
      isRoot,
      isFaculty,
      hasChildren,
      label: base?.label ?? id,
      subtitle: base?.subtitle,
      advisorId: base?.advisorId,
      inputOrder: base?.inputOrder,
      simplePosition: undefined,
      edgeOverride: specialCase?.edge,
      details: {
        advisor: base?.details.advisor,
        career: base?.details.career,
        startYear: base?.details.startYear,
        graduationYear: base?.details.graduationYear,
        graduationUniversity: base?.details.graduationUniversity,
        facultyPosition: base?.details.facultyPosition,
        personalWebsite: base?.details.personalWebsite,
        latitude: base?.details.latitude,
        longitude: base?.details.longitude,
      },
    });
  });

  return nodes;
}

function buildEdges(structure: GraphStructure): EdgeT[] {
  const edges: EdgeT[] = [];
  structure.nodes.forEach((node) => {
    const advisorId = node.advisorId;
    if (!advisorId || advisorId === node.id) return;
    edges.push({ source: advisorId, target: node.id });
  });
  return edges;
}
