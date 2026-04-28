import { defineCoverageConfig } from "../../tools/testing/vitest-coverage";

export default defineCoverageConfig({
  testInclude: ["src/**/*.test.ts"],
  coverageInclude: ["src/**/*.ts"],
});
