/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: [
    "<rootDir>/src/**/*.spec.ts",
    "<rootDir>/test/**/*.e2e-spec.ts",
  ],
  setupFiles: ["reflect-metadata"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    // The shared package ships ESM in dist; point Jest at its TS source so
    // ts-jest compiles it to CJS instead of choking on `import` statements.
    "^@study-planner/shared$": "<rootDir>/packages/shared/src/index.ts",
  },
};
