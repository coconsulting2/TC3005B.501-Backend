import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";

export default [
    js.configs.recommended,
    {
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
                atob: "readonly",
                btoa: "readonly",
                crypto: "readonly",
            },
        },
        rules: {
            // --- Style ---
            "semi": ["error", "always"],
            "quotes": ["warn", "double", { avoidEscape: true, allowTemplateLiterals: true }],
            "no-trailing-spaces": "warn",
            "eol-last": ["warn", "always"],

            // --- Best practices ---
            "eqeqeq": ["warn", "always"],
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-console": ["warn", { allow: ["error", "warn"] }],
            "no-var": "warn",
            "prefer-const": "warn",
            "no-useless-escape": "warn",
            "no-dupe-keys": "warn",
            "no-useless-catch": "warn",

            // --- JSDoc (controllers) ---
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
    // CJS files (.cjs) — allow require()
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
            },
        },
    },
    {
        ignores: [
            "node_modules/**",
            "database/config/**",
            "uploads/**",
            "backup_scripts/**",
            "certs/**",
        ],
    },
];
