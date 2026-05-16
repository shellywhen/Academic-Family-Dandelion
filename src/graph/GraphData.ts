import { parseCSVToNodeData, type NodeData } from "../data/CSVReader";
import { isFacultyCareer } from "./careerUtils";
import type { EdgeT, GraphDataset, GraphNode } from "./GraphType";

function makeNodeId(
  name: string,
  startYear: number | null,
  usage: Map<string, number>
): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node";
  const yearSuffix = startYear ? `-${startYear}` : "";
  const candidate = `${base}${yearSuffix}`;
  const count = usage.get(candidate) ?? 0;
  usage.set(candidate, count + 1);
  return count === 0 ? candidate : `${candidate}-${count + 1}`;
}

function normalizeName(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

function normalizeChiName(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return undefined;
  return trimmed;
}

/** English name, then 中文名 when present (e.g. "Huamin Qu 屈华民"). */
export function formatNodeDisplayLabel(
  label: string,
  subtitle?: string | null
): string {
  const chi = normalizeChiName(subtitle);
  return chi ? `${label} ${chi}` : label;
}

function createNodeFromRecord(
  record: NodeData,
  idUsage: Map<string, number>
): GraphNode {
  const id = makeNodeId(record.name, record.start_year ?? null, idUsage);
  const subtitle = normalizeChiName(record.chi_name);
  const advisor = record.advisor?.trim() || undefined;
  const facultyPosition = record.faculty_position?.trim() || undefined;
  const career = record.career?.trim() || undefined;
  const personalWebsite = record.personal_website?.trim() || undefined;
  return {
    id,
    label: record.name,
    subtitle,
    advisorId: undefined,
    isRoot: false,
    isFaculty: isFacultyCareer(career),
    details: {
      advisor,
      career,
      startYear: record.start_year ?? undefined,
      graduationYear: record.graduation_year ?? undefined,
      graduationUniversity: record.graduation_university || undefined,
      facultyPosition,
      personalWebsite,
      latitude: record.latitude ?? undefined,
      longitude: record.longitude ?? undefined,
    },
  };
}

function linkAdvisorRelationships(nodes: GraphNode[], edges: EdgeT[]) {
  const nameIndex = new Map<string, GraphNode>();
  nodes.forEach((node) => {
    nameIndex.set(node.label.trim().toLowerCase(), node);
  });

  const deduped = new Set<string>();

  nodes.forEach((node) => {
    const advisorName = normalizeName(node.details.advisor);
    if (!advisorName) {
      node.isRoot = true;
      return;
    }
    const advisor = nameIndex.get(advisorName);
    if (!advisor) {
      node.isRoot = true;
      return;
    }
    node.advisorId = advisor.id;
    node.details = { ...node.details, advisor: advisor.label };
    const key = `${advisor.id}->${node.id}`;
    if (!deduped.has(key)) {
      deduped.add(key);
      edges.push({ source: advisor.id, target: node.id });
    }
  });

  // Ensure we always tag the canonical root even if the dataset omitted the advisor link.
  const arie = nameIndex.get("arie kaufman");
  if (arie) {
    arie.isRoot = true;
  } else if (nodes.length) {
    nodes[0].isRoot = true;
  }

  // Update root nodes so they never point to themselves.
  nodes.forEach((node) => {
    if (node.isRoot) {
      node.advisorId = undefined;
    }
  });
}

export function buildGraphFromDataset(
  dataset: Record<number, NodeData>
): GraphDataset {
  const records = Object.values(dataset);
  if (!records.length) {
    return { nodes: [], edges: [] };
  }

  const idUsage = new Map<string, number>();
  const nodes = records.map((record) => createNodeFromRecord(record, idUsage));
  const edges: EdgeT[] = [];
  linkAdvisorRelationships(nodes, edges);
  return { nodes, edges };
}

export function buildGraphFromCSV(text: string): GraphDataset {
  const dataset = parseCSVToNodeData(text);
  return buildGraphFromDataset(dataset);
}
