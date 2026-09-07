import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  globalSetup: "<rootDir>/src/common/globalSetup.ts",
  globalTeardown: "<rootDir>/src/common/globalTeardown.ts",
  setupFilesAfterEnv: ["<rootDir>/src/common/testSetup.ts"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 30000,
};

export default config;
