import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const rawPort = process.env.PORT || "5173";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";
const localApiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:5000";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    // Legacy bundles + polyfills so old captive-portal browsers (Android 7/8)
    // can render the portal. Modern browsers keep using the ES module build.
    legacy({
      targets: ["defaults", "not IE 11"],
      modernPolyfills: true,
    }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Older captive-portal browsers (e.g. Android 7 tablets) cannot parse
    // optional chaining / nullish coalescing in the default ES2020 output.
    target: "es2015",
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: localApiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          // Preserve the hotspot client's IP for captive portal MAC resolution.
          proxy.on("proxyReq", (proxyReq, req) => {
            const forwarded =
              req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
            if (forwarded) {
              proxyReq.setHeader("X-Forwarded-For", String(forwarded));
            }
          });
        },
      },
      "/speedtest": {
        target: localApiTarget,
        changeOrigin: true,
      },
      "/ws-bandwidth": {
        target: localApiTarget,
        ws: true,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
