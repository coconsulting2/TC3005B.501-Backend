/**
 * Extrae el UUID (folio fiscal) del TimbreFiscalDigital en un CFDI 3.3 / 4.0 (XML en texto).
 */
export function extractCfdiUuidFromXml(xml: string): string | null {
  if (!xml || typeof xml !== "string") return null;
  const m = xml.match(
    /UUID\s*=\s*["']([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})["']/i,
  );
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
}
