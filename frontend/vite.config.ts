import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_DEV_API_PROXY || "http://127.0.0.1:5001";

  return {
  server: {
    host: "::",
    port: 8080,
    // Dev: browser calls /api → forward to Express (backend default PORT 5001).
    // Override with VITE_DEV_API_PROXY in .env (e.g. http://127.0.0.1:3000).
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // PDFs live on Express at /invoices/* (not under /api)
      "/invoices": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
