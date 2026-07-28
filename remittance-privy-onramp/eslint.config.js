// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "server/dist/*"],
  },
  {
    rules: {
      "import/no-unresolved": ["error", { ignore: ["^expo-"] }],
    },
  },
]);
