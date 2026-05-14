import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Force all React imports to resolve to the desktop package's React 19
const desktopReact = path.resolve(__dirname, "node_modules/react");
const desktopReactDom = path.resolve(__dirname, "node_modules/react-dom");

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: (id) => {
          if (id === "electron" || id.startsWith("node:")) return true;
          if (["path", "fs", "util", "os", "crypto", "events", "stream", "buffer", "child_process", "http", "https", "url", "querystring", "zlib", "net", "tls", "assert"].includes(id)) return true;
          if (id === "better-sqlite3" || id.includes("better-sqlite3")) return true;
          return false;
        },
      },
    },
    resolve: {
      alias: {
        "@pos/core/services": path.resolve(__dirname, "../core/src/services/index.ts"),
        "@pos/core/types": path.resolve(__dirname, "../core/src/types/index.ts"),
        "@pos/core/schema": path.resolve(__dirname, "../core/src/schema/index.ts"),
        "@pos/core/utils": path.resolve(__dirname, "../core/src/utils/index.ts"),
        "@pos/core/validators": path.resolve(__dirname, "../core/src/validators/index.ts"),
        "@pos/core": path.resolve(__dirname, "../core/src/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, "src/renderer/index.html"),
        output: {
          format: "iife",
        },
      },
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
        // Force single React 19 copy from desktop's own node_modules
        "react": desktopReact,
        "react-dom": desktopReactDom,
        "react/jsx-runtime": path.join(desktopReact, "jsx-runtime"),
        "react/jsx-dev-runtime": path.join(desktopReact, "jsx-dev-runtime"),
        "react-dom/client": path.join(desktopReactDom, "client"),
      },
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      react(),
      {
        name: "force-react-dedupe",
        enforce: "pre" as const,
        resolveId(source) {
          if (source === "react" || source === "react/jsx-runtime" || source === "react/jsx-dev-runtime") {
            return require.resolve(source, { paths: [__dirname] });
          }
          if (source === "react-dom" || source === "react-dom/client") {
            return require.resolve(source, { paths: [__dirname] });
          }
          return null;
        },
      },
    ],
  },
});
