/**
 * @file services/onboarding/importStrategyResolver.js
 * @description Resuelve la estrategia de parseo correcta dado el MIME type o extensión
 *   del archivo subido. Parte del patrón Strategy: el caller desconoce el tipo concreto.
 *
 * Uso:
 *   const strategy = resolveImportStrategy(mimetype, originalname);
 *   const { rows, embeddedRoleMappings } = await strategy.parse(buffer);
 */
import { JsonImportStrategy } from "./strategies/JsonImportStrategy.js";
import { CsvImportStrategy }  from "./strategies/CsvImportStrategy.js";

/** Estrategias registradas en orden de prioridad. */
const STRATEGIES = [
  new JsonImportStrategy(),
  new CsvImportStrategy(),
];

/**
 * Devuelve la estrategia adecuada para el tipo MIME o extensión del archivo.
 *
 * @param {string} mimetype       - MIME type reportado por Multer (puede ser 'application/octet-stream').
 * @param {string} [originalname] - Nombre original del archivo (se usa la extensión como fallback).
 * @returns {import('./strategies/BaseImportStrategy.js').BaseImportStrategy}
 * @throws {Error} Si ninguna estrategia acepta el archivo.
 */
export function resolveImportStrategy(mimetype, originalname = "") {
  const ext = originalname.split(".").pop()?.toLowerCase() ?? "";

  // Mapa extensión → MIME canónico para normalizar octet-stream
  const extMimeMap = {
    json: "application/json",
    csv:  "text/csv",
    txt:  "text/csv",
  };
  const resolvedMime = (mimetype === "application/octet-stream" && extMimeMap[ext])
    ? extMimeMap[ext]
    : mimetype;

  for (const strategy of STRATEGIES) {
    if (strategy.mimeTypes.includes(resolvedMime)) {
      return strategy;
    }
  }

  // Fallback por extensión si el MIME no matcheó
  if (extMimeMap[ext]) {
    const fallbackMime = extMimeMap[ext];
    for (const strategy of STRATEGIES) {
      if (strategy.mimeTypes.includes(fallbackMime)) {
        return strategy;
      }
    }
  }

  const supported = STRATEGIES.flatMap((s) => s.mimeTypes).join(", ");
  throw new Error(
    `Tipo de archivo no soportado: "${mimetype}" (.${ext}). Tipos aceptados: ${supported}.`
  );
}

/**
 * Lista los tipos de archivo aceptados por todas las estrategias registradas.
 * Útil para configurar la validación de Multer.
 * @returns {string[]}
 */
export function acceptedMimeTypes() {
  return STRATEGIES.flatMap((s) => s.mimeTypes);
}
