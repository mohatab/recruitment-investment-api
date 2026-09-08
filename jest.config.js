module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/env.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  collectCoverageFrom: ["src/**/*.js", "!src/server.js", "!src/docs/**"],
  coverageDirectory: "coverage",
  testTimeout: 20000,
};
