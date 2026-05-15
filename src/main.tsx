import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import { Graph2DP5Demo } from "./components/Graph2DP5Demo";
import { store } from "./AppState";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <Graph2DP5Demo />
    </Provider>
  </StrictMode>
);
