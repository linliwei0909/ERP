import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const isDatabaseTestRun = process.argv.some((argument) =>
  argument.replaceAll("\\", "/").includes("tests/db"),
);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: isDatabaseTestRun
      ? "./tests/db-test-global-setup.ts"
      : undefined,
    restoreMocks: true,
  },
});
