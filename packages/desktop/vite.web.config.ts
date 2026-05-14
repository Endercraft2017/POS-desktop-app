import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");
const desktopReact = path.resolve(monorepoRoot, "node_modules/react");
const desktopReactDom = path.resolve(monorepoRoot, "node_modules/react-dom");

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  envDir: __dirname,
  base: "/app/",
  build: {
    outDir: path.resolve(__dirname, "dist-web"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/index.html"),
      output: {
        // Vendor chunk: stable third-party deps that rarely change. Splitting
        // these out means app code changes don't invalidate the vendor cache
        // across deploys, which is the biggest repeat-visit speedup.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-router-dom") || id.includes("react-router")) return "vendor-router";
            if (id.includes("@tanstack/react-query")) return "vendor-query";
            if (id.includes("react-dom") || /[\\/]node_modules[\\/]react[\\/]/.test(id) || /[\\/]node_modules[\\/]scheduler[\\/]/.test(id)) return "vendor-react";
            if (id.includes("zustand")) return "vendor-zustand";
            if (id.includes("ulidx")) return "vendor-ulidx";
          }
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  // sqlite-wasm needs cross-origin isolation for OPFS to work in some browsers.
  // The headers below are no-ops at build time but document the requirement —
  // nginx must serve them for OPFS to work in production.
  // (Without them, sqlite-wasm falls back to non-OPFS storage.)
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@pos/core/services": path.resolve(__dirname, "../core/src/services/index.ts"),
      "@pos/core/types": path.resolve(__dirname, "../core/src/types/index.ts"),
      "@pos/core/schema": path.resolve(__dirname, "../core/src/schema/index.ts"),
      "@pos/core/utils": path.resolve(__dirname, "../core/src/utils/index.ts"),
      "@pos/core/validators": path.resolve(__dirname, "../core/src/validators/index.ts"),
      "@pos/core": path.resolve(__dirname, "../core/src/index.ts"),
      react: desktopReact,
      "react-dom": desktopReactDom,
      "react/jsx-runtime": path.join(desktopReact, "jsx-runtime"),
      "react/jsx-dev-runtime": path.join(desktopReact, "jsx-dev-runtime"),
      "react-dom/client": path.join(desktopReactDom, "client"),
    },
    dedupe: ["react", "react-dom"],
  },
  plugins: [react()],
});
