# TypeScript incremental (`src/ts`)

Solo en esta carpeta se añade código nuevo en **TypeScript**. El resto del backend sigue en **JavaScript** (`.js`).

## Flujo

1. **Fuente:** edita `.ts` aquí.
2. **Verificación local:** `bun run typecheck:new` (sin emitir archivos).
3. **Emitir JS** (para que Node importe desde `.js` del monolito): `bun run build:ts` → salida en `dist/ts/` (gitignored vía `dist`).
4. **Desde código legacy:** `import { algo } from "../dist/ts/algo.js";` (ajusta la ruta relativa; extensión `.js` en el import es correcta con `NodeNext`).

En **Docker dev**, `tsc --watch` corre en paralelo con `node --watch index.js` (ver `package.json` → `dev:with-ts-watch`).

## CI

El job **typecheck-new** en `.github/workflows/ci.yml` ejecuta `bun run typecheck:new` y debe pasar en verde.
