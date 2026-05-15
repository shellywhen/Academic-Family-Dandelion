import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: https://<user>.github.io/Academic-Family-Dandelion/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "serve" ? "/" : "/Academic-Family-Dandelion/",
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
}));
