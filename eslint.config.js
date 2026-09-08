const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        global: "writable",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_|^next$" }],
      "no-console": "off",
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        jest: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/", "coverage/", "uploads/"],
  },
];
