import { configureStore, createSlice } from "@reduxjs/toolkit";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import csvSource from "./data/huamin-tree.csv?raw";
import { parseCSVToNodeData } from "./data/CSVReader";
import { buildGraphFromDataset } from "./graph/GraphData";
import { buildGraphLayout } from "./graph/GraphLayout";
import type { GraphDataset, GraphReference } from "./graph/GraphType";

type GraphState = {
  dataset: GraphDataset | null;
};

const graphDataset = buildGraphFromDataset(parseCSVToNodeData(csvSource));

const initialState: GraphState = {
  dataset: graphDataset,
};

const graphSlice = createSlice({
  name: "graph",
  initialState,
  reducers: {},
});

export const store = configureStore({
  reducer: {
    graph: graphSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
const useAppSelector = useSelector.withTypes<RootState>();

export function useGraphData(): GraphDataset | null {
  return useAppSelector((state) => state.graph.dataset);
}

export function useStoredGraph(): GraphReference | null {
  const graphDatasetState = useGraphData();
  return useMemo(
    () => (graphDatasetState ? buildGraphLayout(graphDatasetState) : null),
    [graphDatasetState]
  );
}
