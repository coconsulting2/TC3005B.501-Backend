import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "node_modules/**",
            "database/config/**",
            "uploads/**",
            "backup_scripts/**",
            "certs/**",
            "coverage/**",
            "dist/**",
            "scripts/**/*.mjs",
        ],
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        plugins: {
            jsdoc,
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                atob: "readonly",
                btoa: "readonly",
                crypto: "readonly",
            },
        },
        rules: {
            "semi": ["error", "always"],
            "quotes": ["warn", "double", { avoidEscape: true, allowTemplateLiterals: true }],
            "no-trailing-spaces": "warn",
            "eol-last": ["warn", "always"],
            "eqeqeq": ["warn", "always"],
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-console": ["warn", { allow: ["error", "warn"] }],
            "no-var": "warn",
            "prefer-const": "warn",
            "no-useless-escape": "warn",
            "no-dupe-keys": "warn",
            "no-useless-catch": "warn",
            "jsdoc/require-jsdoc": ["warn", {
                require: {
                    FunctionDeclaration: true,
                    MethodDefinition: true,
                    ClassDeclaration: true,
                },
            }],
            "jsdoc/require-param": "warn",
            "jsdoc/require-returns": "warn",
            "jsdoc/require-param-type": "warn",
            "jsdoc/require-returns-type": "warn",
        },
    },
    {
        files: ["**/*.cjs"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "writable",
                exports: "writable",
                __dirname: "readonly",
                __filename: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
            },
        },
    },
    {
        files: ["tests/**/*.js", "**/*.test.js", "**/*.spec.js"],
        languageOptions: {
            globals: {
                describe: "readonly",
                test: "readonly",
                expect: "readonly",
                beforeAll: "readonly",
                beforeEach: "readonly",
                afterAll: "readonly",
                afterEach: "readonly",
            },
        },
        rules: {
            "jsdoc/require-jsdoc": "off",
            "jsdoc/require-param": "off",
            "jsdoc/require-returns": "off",
            "jsdoc/require-param-type": "off",
            "jsdoc/require-returns-type": "off",
            "no-constant-binary-expression": "off",
        },
    },
    ...tseslint.config(
        {
            files: ["src/ts/**/*.ts"],
            extends: [tseslint.configs.recommended],
            rules: {
                "@typescript-eslint/no-unused-vars": [
                    "warn",
                    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
                ],
            },
        },
        {
            files: ["tests/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
            extends: [tseslint.configs.recommended],
            languageOptions: {
                globals: {
                    describe: "readonly",
                    test: "readonly",
                    expect: "readonly",
                    beforeAll: "readonly",
                    beforeEach: "readonly",
                    afterAll: "readonly",
                    afterEach: "readonly",
                },
            },
            rules: {
                "@typescript-eslint/no-unused-vars": [
                    "warn",
                    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
                ],
            },
        },
    ),
];
