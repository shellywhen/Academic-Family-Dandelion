import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Graph2DP5Brush, type Graph2DP5BrushHandle } from "./Graph2DP5Brush";
import type { GraphDataset } from "../graph/GraphType";
import { useStoredGraph } from "../AppState";
import { buildGraphLayout } from "../graph/GraphLayout";
import { COLORS } from "../constants/colors";
import { isCompactViewport } from "../utils/viewport";

const PAGE_MARGIN_Y = 20;

function formatCareer(career?: string): string | null {
  const trimmed = career?.trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function WebsiteLinkIcon({ href, compact }: { href: string; compact?: boolean }) {
  const size = compact ? 18 : 22;
  const iconSize = compact ? 13 : 16;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open personal website"
      title="Open personal website"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: compact ? "4px" : "6px",
        color: COLORS.TEXT_PRIMARY,
        flexShrink: 0,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
      </svg>
    </a>
  );
}

function useContainerSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

/** Debounce resize so p5 is not torn down on every observer tick. */
function useDebouncedSize(
  size: { width: number; height: number },
  delayMs = 200
): { width: number; height: number } {
  const [debounced, setDebounced] = useState(size);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const id = window.setTimeout(() => setDebounced(size), delayMs);
    return () => window.clearTimeout(id);
  }, [size.width, size.height, delayMs]);

  return debounced;
}

interface Graph2DP5DemoProps {
  dataset?: GraphDataset;
}

export function Graph2DP5Demo({ dataset: propDataset }: Graph2DP5DemoProps) {
  const graphRef = useRef<Graph2DP5BrushHandle>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasSize = useContainerSize(canvasAreaRef);
  const renderSize = useDebouncedSize(canvasSize);
  const pixelSize =
    renderSize.width > 0 && renderSize.height > 0
      ? { width: renderSize.width, height: renderSize.height }
      : null;
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);
  const storedGraph = useStoredGraph();

  const graphFromProp = useMemo(
    () => (propDataset ? buildGraphLayout(propDataset) : null),
    [propDataset]
  );
  const graph = graphFromProp ?? storedGraph;

  const hasCanvasSize = pixelSize !== null;
  const showLoadingOverlay =
    !graph || !hasCanvasSize || (!isCanvasReady && !hasRenderedOnce);

  const handleCanvasReady = useCallback(() => {
    setIsCanvasReady(true);
    setHasRenderedOnce(true);
  }, []);

  const handleNodeSelect = useCallback((index: number | null) => {
    setSelectedNode(index);
  }, []);

  const handleExportPng = async () => {
    if (!graphRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await graphRef.current.exportPng("vislab-family-tree.png", 1);
    } catch (error) {
      console.error("PNG export failed:", error);
      window.alert(error instanceof Error ? error.message : "PNG export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const compact =
    canvasSize.width > 0 &&
    canvasSize.height > 0 &&
    isCompactViewport(canvasSize.width, canvasSize.height);

  const controlSurfaceStyle = {
    borderRadius: compact ? "8px" : "10px",
    border: compact
      ? "1px solid rgba(139, 154, 70, 0.45)"
      : "2px solid rgba(139, 154, 70, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    color: COLORS.TEXT_PRIMARY,
    fontSize: compact ? "12px" : "14px",
    fontWeight: 600,
    boxShadow: compact
      ? "0 2px 10px rgba(0, 0, 0, 0.1)"
      : "0 4px 16px rgba(0, 0, 0, 0.12)",
  } as const;

  const detailLineStyle = {
    marginTop: compact ? "3px" : "6px",
    color: COLORS.TEXT_SECONDARY,
    fontWeight: 600,
    fontSize: compact ? "11px" : "13px",
    lineHeight: compact ? 1.35 : 1.45,
  } as const;

  const selected =
    graph && selectedNode !== null && selectedNode < graph.nodes.length
      ? graph.nodes[selectedNode]
      : null;

  const roleLabel = selected
    ? selected.isRoot
      ? "Root Professor"
      : formatCareer(selected.details.career)
    : null;
  const websiteUrl = selected?.details.personalWebsite
    ? normalizeWebsiteUrl(selected.details.personalWebsite)
    : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: `${compact ? 8 : PAGE_MARGIN_Y}px 0`,
        backgroundColor: COLORS.BACKGROUND,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {graph && (
        <div
          ref={canvasAreaRef}
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {hasCanvasSize && (
            <Graph2DP5Brush
              ref={graphRef}
              nodes={graph.nodes}
              edges={graph.edges}
              selected={selectedNode}
              onSelect={handleNodeSelect}
              edgeSettings={graph.edgeSettings}
              width={pixelSize.width}
              height={pixelSize.height}
              layoutSpread={1.38}
              fitPadding={2.85}
              onReady={handleCanvasReady}
            />
          )}

          {hasRenderedOnce && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: compact ? "10px" : "20px",
                right: compact ? "10px" : undefined,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: compact ? "6px" : "8px",
                maxWidth: compact ? "min(220px, calc(100% - 20px))" : "320px",
              }}
            >
              <button
                type="button"
                onClick={handleExportPng}
                disabled={isExporting}
                style={{
                  ...controlSurfaceStyle,
                  padding: compact ? "6px 12px" : "10px 18px",
                  cursor: isExporting ? "wait" : "pointer",
                }}
              >
                {isExporting ? "Exporting…" : "Export PNG"}
              </button>

              {selected && (
                <div
                  style={{
                    ...controlSurfaceStyle,
                    padding: compact ? "8px 11px" : "12px 18px",
                    lineHeight: compact ? 1.35 : 1.45,
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: compact ? "6px" : "8px",
                    }}
                  >
                    <span style={{
                      fontWeight: 600
                    }}>{selected.label}</span>
                    {websiteUrl && <WebsiteLinkIcon href={websiteUrl} compact={compact} />}
                  </div>
                  {roleLabel && <div style={detailLineStyle}>{roleLabel}</div>}
                  {selected.details.facultyPosition && (
                    <div style={detailLineStyle}>{selected.details.facultyPosition}</div>
                  )}
                  {selected.advisorId && (
                    <div style={detailLineStyle}>
                      Advisor:{" "}
                      {graph.nodes.find((n) => n.id === selected.advisorId)?.label ?? "Unknown"}
                    </div>
                  )}
                  {selected.details.startYear != null && (
                    <div style={detailLineStyle}>
                      PhD: {selected.details.startYear} -{" "}
                      {selected.details.graduationYear ?? ""}
                    </div>
                  )}
                 
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showLoadingOverlay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.BACKGROUND,
            zIndex: 100,
            fontSize: "14px",
            fontWeight: 600,
            color: COLORS.TEXT_SECONDARY,
          }}
        >
          Loading HKUST VisLab family tree...
        </div>
      )}
    </div>
  );
}
