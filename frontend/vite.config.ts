import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Vendor chunks, matched by package directory in the module id. */
const VENDOR_CHUNKS: [string, RegExp][] = [
  ["react", /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/],
  ["query", /[\\/]node_modules[\\/]@tanstack[\\/]/],
  ["forms", /[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/],
];

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 3000,
    // In development the SPA calls `/api/...` and Vite forwards it to the
    // backend with the prefix stripped, mirroring what nginx does in
    // production. The FastAPI app serves its routes at the root — the `/api`
    // prefix exists only so the browser can tell the API apart from static
    // assets on the same origin.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    // Split the vendor libraries out of the app chunk so a code change does not
    // invalidate the whole cached bundle.
    //
    // Vite 8 is Rolldown-based, and its `manualChunks` is a *function* — the
    // object-map form that older Vite accepted does not type-check. Matching on
    // the path with an explicit separator class keeps this correct on Windows,
    // where module ids use backslashes.
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          for (const [chunk, pattern] of VENDOR_CHUNKS) {
            if (pattern.test(id)) return chunk;
          }
          return undefined;
        },
      },
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
