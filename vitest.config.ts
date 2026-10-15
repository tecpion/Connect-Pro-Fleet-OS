import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

// Vitest must NOT load the TanStack Start vite.config.ts (which pulls in the
// router plugin that crashes in vitest's Vite server). This is a standalone
// vitest config that only needs path aliases + React + jsdom.
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/test/**/*.{test,spec}.{ts,tsx}"],
  },
});
