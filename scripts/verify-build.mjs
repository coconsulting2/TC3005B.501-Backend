/**
 * Ejecuta ESLint (solo errores) y emite TypeScript desde src/ts → dist/ts.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const eslintCli = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
const tscCli = path.join(root, "node_modules", "typescript", "bin", "tsc");

execFileSync(process.execPath, [eslintCli, ".", "--quiet"], { stdio: "inherit", cwd: root });
execFileSync(process.execPath, [tscCli, "-p", "tsconfig.build.json"], { stdio: "inherit", cwd: root });
