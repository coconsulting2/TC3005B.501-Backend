/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Vitest configuration for unit testing React components with jsdom + RTL.
 * Mirrors the path aliases from tsconfig.json so component imports work
 * the same way they do in production builds.
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": r("./src"),
      "@assets": r("./src/assets"),
      "@components": r("./src/components"),
      "@layouts": r("./src/layouts"),
      "@pages": r("./src/pages"),
      "@type": r("./src/types"),
      "@utils": r("./src/utils"),
      "@data": r("./src/data"),
      "@views": r("./src/views"),
      "@config": r("./src/config"),
      "@styles": r("./src/styles"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/frontend/**/*.test.{ts,tsx}"],
    css: false,
    env: {
      PUBLIC_API_BASE_URL: "https://localhost:3000/api",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/components/Button.tsx",
        "src/components/InputField.tsx",
        "src/components/Select.tsx",
        "src/components/Modal.tsx",
        "src/components/Toast.tsx",
        "src/components/FileDropZone.tsx",
        "src/components/ProgressBar.tsx",
        "src/components/Table/DataTable.tsx",
        "src/components/CfdiSatBadge.tsx",
        "src/components/XmlExpenseForm.tsx",
        "src/components/ResumenTramos.tsx",
        "src/components/UploadReceiptFiles.tsx",
        "src/components/RolesAdmin.tsx",
        "src/components/SimuladorWorkflow.tsx",
        "src/components/RequestsLists/AuthRequestsList.tsx",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
