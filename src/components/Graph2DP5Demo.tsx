import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Graph2DP5Brush, type Graph2DP5BrushHandle } from "./Graph2DP5Brush";
import type { GraphDataset } from "../graph/GraphType";
import { useStoredGraph } from "../AppState";
import { buildGraphLayout } from "../graph/GraphLayout";
import { COLORS } from "../constants/colors";

const PAGE_MARGIN_Y = 20;

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

interface Graph2DP5DemoProps {
  dataset?: GraphDataset;
}

export function Graph2DP5Demo({ dataset: propDataset }: Graph2DP5DemoProps) {
  const graphRef = useRef<Graph2DP5BrushHandle>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasSize = useContainerSize(canvasAreaRef);
  const [pixelSize, setPixelSize] = useState<{ width: number; height: number } | null>(
    null
  );

  useEffect(() => {
    if (pixelSize) return;
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      setPixelSize({ width: canvasSize.width, height: canvasSize.height });
    }
  }, [canvasSize.width, canvasSize.height, pixelSize]);
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

  const controlSurfaceStyle = {
    borderRadius: "10px",
    border: "2px solid rgba(139, 154, 70, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    color: COLORS.TEXT_PRIMARY,
    fontSize: "14px",
    fontWeight: 600,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
  } as const;

  const detailLineStyle = {
    marginTop: "6px",
    color: COLORS.TEXT_SECONDARY,
    fontWeight: 600,
  } as const;

  const selected =
    graph && selectedNode !== null && selectedNode < graph.nodes.length
      ? graph.nodes[selectedNode]
      : null;

  const roleLabel = selected
    ? selected.isRoot
      ? "Root Professor"
      : selected.isFaculty
        ? "Faculty Member"
        : "PhD Student"
    : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: `${PAGE_MARGIN_Y}px 0`,
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
                left: "20px",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "8px",
                maxWidth: "320px",
              }}
            >
              <button
                type="button"
                onClick={handleExportPng}
                disabled={isExporting}
                style={{
                  ...controlSurfaceStyle,
                  padding: "10px 18px",
                  cursor: isExporting ? "wait" : "pointer",
                }}
              >
                {isExporting ? "Exporting…" : "Export PNG"}
              </button>

              {selected && (
                <div
                  style={{
                    ...controlSurfaceStyle,
                    padding: "12px 18px",
                    lineHeight: 1.45,
                    textAlign: "left",
                  }}
                >
                  <div>{selected.label}</div>
                  <div style={detailLineStyle}>{roleLabel}</div>
                  {selected.advisorId && (
                    <div style={detailLineStyle}>
                      Advisor:{" "}
                      {graph.nodes.find((n) => n.id === selected.advisorId)?.label ?? "Unknown"}
                    </div>
                  )}
                  {selected.details.startYear && (
                    <div style={detailLineStyle}>Start: {selected.details.startYear}</div>
                  )}
                  {selected.details.graduationYear && (
                    <div style={detailLineStyle}>Graduate: {selected.details.graduationYear}</div>
                  )}
                  {selected.details.facultyPosition && (
                    <div style={detailLineStyle}>Position: {selected.details.facultyPosition}</div>
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
          loading HKUST VisLab family tree...
        </div>
      )}
    </div>
  );
}
