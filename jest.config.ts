import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/src/common/testSetup.ts"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 30000,
};

export default config;
