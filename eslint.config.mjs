import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    /**
     * Services and adapters are the typed core of the app: services are pure
     * functions over domain data, adapters are the only code allowed to touch a
     * platform SDK. The build spec forbids `any` in both — an untyped Graph API
     * response is exactly how malformed data reaches Firestore unnoticed.
     */
    files: ["src/services/**/*.ts", "src/adapters/**/*.ts", "src/lib/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    /**
     * Adapters are the ONLY place allowed to reach the network. If a service
     * starts calling fetch(), the boundary that makes a new platform a drop-in
     * has already been broken.
     */
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Services must stay pure — no HTTP. Move the call into an adapter and pass the data in.",
        },
      ],
    },
  },

  // Must come last: turns off stylistic rules that would fight Prettier.
  prettier,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design source of truth — not application code.
    "signal-preview-v2.html",
  ]),
]);

export default eslintConfig;
