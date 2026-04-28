/**
 * Extrae el atributo Total del nodo cfdi:Comprobante (mismo criterio que el parser del API).
 * No sustituye a la validación del servidor; sirve para autorrellenar el formulario.
 */
export function extractCfdiTotalFromXml(xml: string): number | null {
  if (!xml || typeof xml !== "string") return null;
  const tag = xml.match(/<[^>]*:?Comprobante\b[^>]*>/i);
  if (!tag) return null;
  const totalMatch = tag[0].match(/\bTotal\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']/i);
  if (!totalMatch?.[1]) return null;
  const n = parseFloat(totalMatch[1]);
  return Number.isFinite(n) ? n : null;
}

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
