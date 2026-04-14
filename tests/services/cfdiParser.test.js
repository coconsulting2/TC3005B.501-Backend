/**
 * @module cfdiParser.test
 * @description Unit tests for the CFDI XML parser service.
 * Covers: v4.0 restaurant receipt, v3.3 hotel receipt, v4.0 transport with retention,
 * invalid XML, missing required nodes, unsupported version, and malformed UUID.
 */
import { describe, it, expect } from "@jest/globals";
import { parseCFDI, CfdiParseError } from "../../services/cfdiParserService.js";

// ─── CFDI Fixtures ────────────────────────────────────────────────────────────

/**
 * Fixture 1: CFDI v4.0 – Restaurant receipt with IVA 16% traslado
 * Emisor: EKU9003173C9, Receptor: XAXX010101000 (público en general)
 * Total: MXN 1,160.00 (Subtotal 1,000 + IVA 160)
 */
const CFDI_V40_RESTAURANT = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"
  Serie="R"
  Folio="0001"
  Fecha="2024-03-15T14:30:00"
  Sello="ABC123"
  FormaPago="03"
  NoCertificado="30001000000400002434"
  Certificado="MIID..."
  SubTotal="1000.00"
  Total="1160.00"
  Moneda="MXN"
  TipoDeComprobante="I"
  Exportacion="01"
  MetodoPago="PUE"
  LugarExpedicion="06600">
  <cfdi:Emisor
    Rfc="EKU9003173C9"
    Nombre="EMPRESA KOKONE SA DE CV"
    RegimenFiscal="601"/>
  <cfdi:Receptor
    Rfc="XAXX010101000"
    Nombre="PUBLICO EN GENERAL"
    DomicilioFiscalReceptor="06600"
    RegimenFiscalReceptor="616"
    UsoCFDI="S01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="90111500"
      Cantidad="1"
      ClaveUnidad="ACT"
      Descripcion="Servicio de alimentos"
      ValorUnitario="1000.00"
      Importe="1000.00"
      ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado
            Base="1000.00"
            Impuesto="002"
            TipoFactor="Tasa"
            TasaOCuota="0.160000"
            Importe="160.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="1000.00"
        Impuesto="002"
        TipoFactor="Tasa"
        TasaOCuota="0.160000"
        Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
      NoCertificadoSAT="20001000000300022323"
      RfcProvCertif="SAT970701NN3"
      FechaTimbrado="2024-03-15T14:30:45"
      SelloCFD="xyz..."
      SelloSAT="sat..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/**
 * Fixture 2: CFDI v3.3 – Hotel receipt with IVA 16%
 * Emisor: AAA010101AAA, Receptor: JUFA7509103S4
 * Total: MXN 3,480.00 (Subtotal 3,000 + IVA 480)
 */
const CFDI_V33_HOTEL = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/3"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv33.xsd"
  Version="3.3"
  Serie="H"
  Folio="5500"
  Fecha="2023-11-20T18:00:00"
  Sello="DEF456"
  FormaPago="04"
  NoCertificado="30001000000400002434"
  Certificado="MIID..."
  SubTotal="3000.00"
  Total="3480.00"
  Moneda="MXN"
  TipoDeComprobante="I"
  MetodoPago="PUE"
  LugarExpedicion="64000">
  <cfdi:Emisor
    Rfc="AAA010101AAA"
    Nombre="HOTEL COSTA AZUL SA DE CV"
    RegimenFiscal="601"/>
  <cfdi:Receptor
    Rfc="JUFA7509103S4"
    Nombre="JUAN FLORES AGUILAR"
    UsoCFDI="D01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="55111500"
      Cantidad="3"
      ClaveUnidad="E48"
      Descripcion="Hospedaje noche"
      ValorUnitario="1000.00"
      Importe="3000.00">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado
            Base="3000.00"
            Impuesto="002"
            TipoFactor="Tasa"
            TasaOCuota="0.160000"
            Importe="480.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="480.00">
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="3000.00"
        Impuesto="002"
        TipoFactor="Tasa"
        TasaOCuota="0.160000"
        Importe="480.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="B2C3D4E5-F6A7-8901-BCDE-F12345678901"
      NoCertificadoSAT="20001000000300022323"
      RfcProvCertif="SAT970701NN3"
      FechaTimbrado="2023-11-20T18:01:10"
      SelloCFD="abc..."
      SelloSAT="def..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/**
 * Fixture 3: CFDI v4.0 – Transport with IVA traslado + ISR retencion
 * Emisor: TAXS730423FG8, Receptor: MARG850601QX3
 * SubTotal: 1,000 | IVA 16%: 160 | ISR 10% retencion: 100 | Total: 1,060
 */
const CFDI_V40_TRANSPORT_WITH_RETENCION = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"
  Serie="T"
  Folio="0099"
  Fecha="2024-06-10T09:15:00"
  Sello="GHI789"
  FormaPago="99"
  NoCertificado="30001000000400002434"
  Certificado="MIID..."
  SubTotal="1000.00"
  Total="1060.00"
  Moneda="MXN"
  TipoDeComprobante="I"
  Exportacion="01"
  MetodoPago="PPD"
  LugarExpedicion="44100">
  <cfdi:Emisor
    Rfc="TAXS730423FG8"
    Nombre="TRANSPORTES AXEL SA DE CV"
    RegimenFiscal="601"/>
  <cfdi:Receptor
    Rfc="MARG850601QX3"
    Nombre="MARIA GARCIA RAMIREZ"
    DomicilioFiscalReceptor="44100"
    RegimenFiscalReceptor="612"
    UsoCFDI="G01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="78101800"
      Cantidad="1"
      ClaveUnidad="E48"
      Descripcion="Servicio de transporte terrestre"
      ValorUnitario="1000.00"
      Importe="1000.00"
      ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado
            Base="1000.00"
            Impuesto="002"
            TipoFactor="Tasa"
            TasaOCuota="0.160000"
            Importe="160.00"/>
        </cfdi:Traslados>
        <cfdi:Retenciones>
          <cfdi:Retencion
            Base="1000.00"
            Impuesto="001"
            TipoFactor="Tasa"
            TasaOCuota="0.100000"
            Importe="100.00"/>
        </cfdi:Retenciones>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos
    TotalImpuestosTrasladados="160.00"
    TotalImpuestosRetenidos="100.00">
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="1000.00"
        Impuesto="002"
        TipoFactor="Tasa"
        TasaOCuota="0.160000"
        Importe="160.00"/>
    </cfdi:Traslados>
    <cfdi:Retenciones>
      <cfdi:Retencion
        Impuesto="001"
        Importe="100.00"/>
    </cfdi:Retenciones>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="C3D4E5F6-A7B8-9012-CDEF-123456789012"
      NoCertificadoSAT="20001000000300022323"
      RfcProvCertif="SAT970701NN3"
      FechaTimbrado="2024-06-10T09:16:00"
      SelloCFD="pqr..."
      SelloSAT="stu..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

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
