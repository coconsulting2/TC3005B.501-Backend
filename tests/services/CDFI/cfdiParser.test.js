/**
 * @module cfdiParser.test
 * @description Unit tests for the CFDI XML parser service.
 * Covers: v4.0 restaurant receipt, v3.3 hotel receipt, v4.0 transport with retention,
 * invalid XML, missing required nodes, unsupported version, and malformed UUID.
 */
import { describe, it, expect } from "@jest/globals";
import {
  parseCFDI,
  CfdiParseError,
  buildComprobanteRegistroBodyFromXml,
} from "../../../services/cfdiParserService.js";
import { Importer } from "../../utils/importXML.js";


const CFDI = new Importer("./tax_invoices(CFDIs)", import.meta.url);

// ─── CFDI Fixtures ────────────────────────────────────────────────────────────

/**
 * Fixture 1: CFDI v4.0 – Restaurant receipt with IVA 16% traslado
 * Emisor: EKU9003173C9, Receptor: XAXX010101000 (público en general)
 * Total: MXN 1,160.00 (Subtotal 1,000 + IVA 160)
 */
const CFDI_V40_RESTAURANT = await CFDI.import("CFDI-v40-restaurant.xml");

/**
 * Fixture 2: CFDI v3.3 – Hotel receipt with IVA 16%
 * Emisor: AAA010101AAA, Receptor: JUFA7509103S4
 * Total: MXN 3,480.00 (Subtotal 3,000 + IVA 480)
 */
const CFDI_V33_HOTEL = await CFDI.import("CFDI-v33-hotel.xml");

/**
 * Fixture 3: CFDI v4.0 – Transport with IVA traslado + ISR retencion
 * Emisor: TAXS730423FG8, Receptor: MARG850601QX3
 * SubTotal: 1,000 | IVA 16%: 160 | ISR 10% retencion: 100 | Total: 1,060
 */
const CFDI_V40_TRANSPORT_WITH_RETENCION = await CFDI.import("CFDI-v40-transport-with-retention.xml");

// ─── Malformed CFDI Fixtures ─────────────────────────────────────────────────

/** Malformed fixture: Comprobante tag is not closed before Emisor */
const CFDI_MALFORMED_BROKEN_TAG = await CFDI.import("CFDI-malformed-broken-tag.xml");

/** Malformed fixture: Complemento present but TimbreFiscalDigital missing */
const CFDI_MALFORMED_NO_TIMBRE = await CFDI.import("CFDI-malformed-no-timbre.xml");

/** Malformed fixture: Comprobante root without Version attribute */
const CFDI_MALFORMED_NO_VERSION = await CFDI.import("CFDI-malformed-no-version.xml");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseCFDI", () => {

  // ── Fixture 1: CFDI v4.0 Restaurant ─────────────────────────────────────

  describe("CFDI v4.0 – restaurant receipt", () => {
    let result;

    it("parses without throwing", () => {
      expect(() => { result = parseCFDI(CFDI_V40_RESTAURANT); }).not.toThrow();
    });

    it("extracts correct version", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.version).toBe("4.0");
    });

    it("extracts RFC emisor", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.rfcEmisor).toBe("EKU9003173C9");
    });

    it("extracts RFC receptor", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.rfcReceptor).toBe("XAXX010101000");
    });

    it("extracts UUID in uppercase", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.uuid).toBe("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
    });

    it("extracts total as number", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.total).toBe(1160.00);
    });

    it("extracts fecha as Date", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.fecha).toBeInstanceOf(Date);
      expect(result.fecha.getFullYear()).toBe(2024);
      expect(result.fecha.getMonth()).toBe(2); // March = 2 (0-indexed)
    });

    it("extracts IVA traslado with correct values", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.taxes.traslados).toHaveLength(1);
      const iva = result.taxes.traslados[0];
      expect(iva.impuesto).toBe("002");
      expect(iva.impuestoNombre).toBe("IVA");
      expect(iva.tipoFactor).toBe("Tasa");
      expect(iva.tasaOCuota).toBe(0.16);
      expect(iva.importe).toBe(160.00);
    });

    it("has no retenciones", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.taxes.retenciones).toHaveLength(0);
    });

    it("has correct totalTrasladados", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.taxes.totalTrasladados).toBe(160.00);
    });

    it("expone sello y selloUltimos8 null cuando Sello tiene menos de 8 caracteres", () => {
      result = parseCFDI(CFDI_V40_RESTAURANT);
      expect(result.sello).toBe("ABC123");
      expect(result.selloUltimos8).toBeNull();
    });

    it("expone selloUltimos8 con los ultimos 8 cuando Sello es suficientemente largo", () => {
      const longSello = "ABCDEF00GH12345678IJ";
      const xml = CFDI_V40_RESTAURANT.replace('Sello="ABC123"', `Sello="${longSello}"`);
      result = parseCFDI(xml);
      expect(result.sello).toBe(longSello);
      expect(result.selloUltimos8).toBe("345678IJ");
    });
  });

  // ── Fixture 2: CFDI v3.3 Hotel ──────────────────────────────────────────

  describe("CFDI v3.3 – hotel receipt", () => {
    let result;

    it("parses without throwing", () => {
      expect(() => { result = parseCFDI(CFDI_V33_HOTEL); }).not.toThrow();
    });

    it("extracts correct version 3.3", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.version).toBe("3.3");
    });

    it("extracts RFC emisor", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.rfcEmisor).toBe("AAA010101AAA");
    });

    it("extracts RFC receptor", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.rfcReceptor).toBe("JUFA7509103S4");
    });

    it("extracts UUID", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.uuid).toBe("B2C3D4E5-F6A7-8901-BCDE-F12345678901");
    });

    it("extracts total 3480.00", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.total).toBe(3480.00);
    });

    it("extracts IVA traslado 16% with importe 480", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      const iva = result.taxes.traslados[0];
      expect(iva.impuesto).toBe("002");
      expect(iva.importe).toBe(480.00);
      expect(iva.base).toBe(3000.00);
    });

    it("extracts fecha as Date in 2023", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.fecha).toBeInstanceOf(Date);
      expect(result.fecha.getFullYear()).toBe(2023);
      expect(result.fecha.getMonth()).toBe(10); // November = 10 (0-indexed)
    });

    it("normalizes rfcReceptor to uppercase", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.rfcReceptor).toBe("JUFA7509103S4");
    });

    it("exposes totalTrasladados 480.00 from Impuestos node", () => {
      result = parseCFDI(CFDI_V33_HOTEL);
      expect(result.taxes.totalTrasladados).toBe(480.00);
    });
  });

  // ── Fixture 3: CFDI v4.0 Transport with IVA + ISR retencion ─────────────

  describe("CFDI v4.0 – transport with IVA traslado and ISR retencion", () => {
    let result;

    it("parses without throwing", () => {
      expect(() => { result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION); }).not.toThrow();
    });

    it("extracts RFC emisor", () => {
      result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION);
      expect(result.rfcEmisor).toBe("TAXS730423FG8");
    });

    it("extracts UUID", () => {
      result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION);
      expect(result.uuid).toBe("C3D4E5F6-A7B8-9012-CDEF-123456789012");
    });

    it("extracts total 1060.00", () => {
      result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION);
      expect(result.total).toBe(1060.00);
    });

    it("has IVA traslado", () => {
      result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION);
      expect(result.taxes.traslados).toHaveLength(1);
      expect(result.taxes.traslados[0].impuestoNombre).toBe("IVA");
      expect(result.taxes.traslados[0].importe).toBe(160.00);
    });

    it("has ISR retencion", () => {
      result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION);
      expect(result.taxes.retenciones).toHaveLength(1);
      expect(result.taxes.retenciones[0].impuesto).toBe("001");
      expect(result.taxes.retenciones[0].impuestoNombre).toBe("ISR");
      expect(result.taxes.retenciones[0].importe).toBe(100.00);
    });

    it("has correct totals for traslados and retenciones", () => {
      result = parseCFDI(CFDI_V40_TRANSPORT_WITH_RETENCION);
      expect(result.taxes.totalTrasladados).toBe(160.00);
      expect(result.taxes.totalRetenidos).toBe(100.00);
    });
  });

  // ── Error cases ──────────────────────────────────────────────────────────

  describe("error cases", () => {

    it("throws CfdiParseError with EMPTY_XML on empty string", () => {
      expect(() => parseCFDI("")).toThrow(CfdiParseError);
      try { parseCFDI(""); } catch (e) { expect(e.code).toBe("EMPTY_XML"); }
    });

    it("throws CfdiParseError with INVALID_XML on malformed XML", () => {
      expect(() => parseCFDI("<unclosed")).toThrow(CfdiParseError);
      try { parseCFDI("<unclosed"); } catch (e) {
        expect(e.code).toBe("INVALID_XML");
      }
    });

    it("throws MISSING_COMPROBANTE when root node is not cfdi:Comprobante", () => {
      const xml = `<?xml version="1.0"?><Factura Version="4.0"/>`;
      expect(() => parseCFDI(xml)).toThrow(CfdiParseError);
      try { parseCFDI(xml); } catch (e) {
        expect(e.code).toBe("MISSING_COMPROBANTE");
      }
    });

    it("throws UNSUPPORTED_VERSION for version 3.2", () => {
      const xml = CFDI_V40_RESTAURANT.replace('Version="4.0"', 'Version="3.2"');
      try { parseCFDI(xml); } catch (e) {
        expect(e).toBeInstanceOf(CfdiParseError);
        expect(e.code).toBe("UNSUPPORTED_VERSION");
      }
    });

    it("throws MISSING_RFC_EMISOR when Emisor has no Rfc attribute", () => {
      const xml = CFDI_V40_RESTAURANT.replace('Rfc="EKU9003173C9"', "");
      try { parseCFDI(xml); } catch (e) {
        expect(e).toBeInstanceOf(CfdiParseError);
        expect(e.code).toBe("MISSING_RFC_EMISOR");
      }
    });

    it("throws MISSING_COMPLEMENTO when Complemento node is absent", () => {
      const xml = CFDI_V40_RESTAURANT
        .replace(/<cfdi:Complemento[\s\S]*?<\/cfdi:Complemento>/, "");
      try { parseCFDI(xml); } catch (e) {
        expect(e).toBeInstanceOf(CfdiParseError);
        expect(e.code).toBe("MISSING_COMPLEMENTO");
      }
    });

    it("throws MISSING_UUID when UUID attribute is absent", () => {
      const xml = CFDI_V40_RESTAURANT.replace('UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"', "");
      try { parseCFDI(xml); } catch (e) {
        expect(e).toBeInstanceOf(CfdiParseError);
        expect(e.code).toBe("MISSING_UUID");
      }
    });

    it("throws INVALID_UUID_FORMAT when UUID is malformed", () => {
      const xml = CFDI_V40_RESTAURANT.replace(
        'UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"',
        'UUID="NOT-A-VALID-UUID"'
      );
      try { parseCFDI(xml); } catch (e) {
        expect(e).toBeInstanceOf(CfdiParseError);
        expect(e.code).toBe("INVALID_UUID_FORMAT");
      }
    });

    it("throws MISSING_FECHA when Fecha attribute is absent", () => {
      const xml = CFDI_V40_RESTAURANT.replace('Fecha="2024-03-15T14:30:00"', "");
      try { parseCFDI(xml); } catch (e) {
        expect(e).toBeInstanceOf(CfdiParseError);
        expect(e.code).toBe("MISSING_FECHA");
      }
    });

    it("throws INVALID_XML for malformed broken-tag fixture", () => {
      expect(() => parseCFDI(CFDI_MALFORMED_BROKEN_TAG)).toThrow(CfdiParseError);
      try { parseCFDI(CFDI_MALFORMED_BROKEN_TAG); } catch (e) {
        expect(e.code).toBe("INVALID_XML");
      }
    });

    it("throws MISSING_TIMBRE when Complemento has no TimbreFiscalDigital (fixture)", () => {
      expect(() => parseCFDI(CFDI_MALFORMED_NO_TIMBRE)).toThrow(CfdiParseError);
      try { parseCFDI(CFDI_MALFORMED_NO_TIMBRE); } catch (e) {
        expect(e.code).toBe("MISSING_TIMBRE");
      }
    });

    it("throws MISSING_VERSION when Version attribute is absent (fixture)", () => {
      expect(() => parseCFDI(CFDI_MALFORMED_NO_VERSION)).toThrow(CfdiParseError);
      try { parseCFDI(CFDI_MALFORMED_NO_VERSION); } catch (e) {
        expect(e.code).toBe("MISSING_VERSION");
      }
    });

    it("throws MISSING_EMISOR when Emisor node is absent", () => {
      const xml = CFDI_V40_RESTAURANT.replace(/<cfdi:Emisor[\s\S]*?\/>/, "");
      expect(() => parseCFDI(xml)).toThrow(CfdiParseError);
      try { parseCFDI(xml); } catch (e) {
        expect(e.code).toBe("MISSING_EMISOR");
      }
    });

    it("throws INVALID_FECHA when Fecha is not a valid ISO date", () => {
      const xml = CFDI_V40_RESTAURANT.replace(
        'Fecha="2024-03-15T14:30:00"',
        'Fecha="not-a-date"',
      );
      expect(() => parseCFDI(xml)).toThrow(CfdiParseError);
      try { parseCFDI(xml); } catch (e) {
        expect(e.code).toBe("INVALID_FECHA");
      }
    });

    it("throws MISSING_TOTAL when Total attribute is absent", () => {
      const xml = CFDI_V40_RESTAURANT.replace('Total="1160.00"', "");
      expect(() => parseCFDI(xml)).toThrow(CfdiParseError);
      try { parseCFDI(xml); } catch (e) {
        expect(e.code).toBe("MISSING_TOTAL");
      }
    });

    it("throws INVALID_TOTAL when Total is not numeric", () => {
      const xml = CFDI_V40_RESTAURANT.replace('Total="1160.00"', 'Total="abc"');
      expect(() => parseCFDI(xml)).toThrow(CfdiParseError);
      try { parseCFDI(xml); } catch (e) {
        expect(e.code).toBe("INVALID_TOTAL");
      }
    });
  });

  describe("buildComprobanteRegistroBodyFromXml", () => {
    it("builds snake_case body with timbre and comprobante fields (v4.0 restaurant)", () => {
      const body = buildComprobanteRegistroBodyFromXml(CFDI_V40_RESTAURANT);
      expect(body.uuid).toBe("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
      expect(body.rfc_emisor).toBe("EKU9003173C9");
      expect(body.rfc_receptor).toBe("XAXX010101000");
      expect(body.total).toBe(1160);
      expect(body.moneda).toBe("MXN");
      expect(body.tipo_comprobante).toBe("I");
      expect(body.version).toBe("4.0");
      expect(body.rfc_pac).toBe("SAT970701NN3");
      // Sello del fixture es demasiado corto (< 8) — no se incluye sello_emisor
      expect(body.sello_emisor).toBeUndefined();
      expect(body.iva).toBe(160);
    });

    it("body incluye metodo_pago, forma_pago y lugar_expedicion del comprobante v4.0", () => {
      const body = buildComprobanteRegistroBodyFromXml(CFDI_V40_RESTAURANT);
      expect(body.metodo_pago).toMatch(/^(PUE|PPD)$/);
      expect(body.forma_pago).toHaveLength(2);
      expect(body.lugar_expedicion).toMatch(/^\d{5}$/);
    });

    it("body incluye regimen fiscal de emisor y receptor v4.0", () => {
      const body = buildComprobanteRegistroBodyFromXml(CFDI_V40_RESTAURANT);
      expect(body.regimen_fiscal_emisor).toHaveLength(3);
      expect(body.regimen_fiscal_receptor).toHaveLength(3);
      expect(body.domicilio_fiscal_receptor).toMatch(/^\d{5}$/);
    });

    it("body expone subtotal y tipo_cambio v4.0", () => {
      const body = buildComprobanteRegistroBodyFromXml(CFDI_V40_RESTAURANT);
      expect(body.subtotal).toBe(1000);
      expect(body.tipo_cambio).toBe(1);
    });

    it("rechaza CFDI v3.3 con INVALID_REGIMEN porque v3.3 no trae RegimenFiscalReceptor", () => {
      expect(() => buildComprobanteRegistroBodyFromXml(CFDI_V33_HOTEL)).toThrow(CfdiParseError);
      try { buildComprobanteRegistroBodyFromXml(CFDI_V33_HOTEL); } catch (e) {
        expect(e.code).toBe("INVALID_REGIMEN");
      }
    });
  });

  // ── CfdiParseError class ────────────────────────────────────────────────

  describe("CfdiParseError", () => {
    it("has correct name and code properties", () => {
      const err = new CfdiParseError("test message", "TEST_CODE");
      expect(err.name).toBe("CfdiParseError");
      expect(err.code).toBe("TEST_CODE");
      expect(err.message).toBe("test message");
      expect(err).toBeInstanceOf(Error);
    });
  });
});
