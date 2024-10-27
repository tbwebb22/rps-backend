import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {files: ["**/*.js"], languageOptions: {sourceType: "commonjs", globals: {
    ...globals.node,
    process: 'readonly'
  }}},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
];
