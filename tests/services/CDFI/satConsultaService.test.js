/**
 * @file tests/services/satConsultaService.test.js
 * @description Pruebas unitarias de armado de expresionImpresa y normalizacion de acuse SAT.
 * Cubre los 3 estatus esperados por M1-QA4 (Vigente, Cancelado, No Encontrado) y la
 * transformacion a snake_case para el modelo de CFDI. Se usan respuestas simuladas
 * (mocks) por falta de UUIDs reales del SAT.
 */
import { describe, it, expect } from "@jest/globals";
import {
  buildExpresionImpresa,
  normalizeConsultaResult,
  acuseToCfdiRow,
} from "../../../services/satConsultaService.js";

describe("satConsultaService", () => {
  describe("buildExpresionImpresa", () => {
    it("arma la cadena sin fe si no hay selloUltimos8", () => {
      const s = buildExpresionImpresa({
        rfcEmisor: "AAA010101AAA",
        rfcReceptor: "BBB010101BBB",
        total: 100.5,
        uuid: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(s).toBe(
        "?re=AAA010101AAA&rr=BBB010101BBB&tt=100.50&id=550E8400-E29B-41D4-A716-446655440000",
      );
    });

    it("anade fe con los ultimos 8 caracteres del sello", () => {
      const s = buildExpresionImpresa({
        rfcEmisor: "A",
        rfcReceptor: "B",
        total: 1,
        uuid: "550e8400-e29b-41d4-a716-446655440000",
        selloUltimos8: "XX12345678YY",
      });
      expect(s).toContain("&fe=345678YY");
    });

    it("formatea total con 2 decimales aun si viene entero", () => {
      const s = buildExpresionImpresa({
        rfcEmisor: "A",
        rfcReceptor: "B",
        total: 1000,
        uuid: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(s).toContain("&tt=1000.00");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Normalizacion de acuse SAT — estatus esperados por M1-QA4
  // Acuses simulados siguiendo la estructura de node-soap del WS
  // ConsultaCFDIService.svc. Se usan mocks por falta de datos reales.
  // ─────────────────────────────────────────────────────────────
  describe("normalizeConsultaResult", () => {
    it("Vigente sin codigo EFOS explicito asigna 200 por default", () => {
      const r = normalizeConsultaResult({
        ConsultaResult: {
          CodigoEstatus: "S - Comprobante obtenido satisfactoriamente",
          Estado: "Vigente",
          EsCancelable: "Cancelable sin aceptación",
          EstatusCancelacion: "",
          ValidacionEFOS: "",
        },
      });
      expect(r.estado).toBe("Vigente");
      expect(r.validacionEFOS).toBe("200");
      expect(r.esCancelable).toBe("Cancelable sin aceptación");
    });

    it("Cancelado mantiene ValidacionEFOS vacio (no se fuerza 200)", () => {
      const r = normalizeConsultaResult({
        ConsultaResult: {
          CodigoEstatus: "S - Comprobante obtenido satisfactoriamente",
          Estado: "Cancelado",
          EsCancelable: "",
          EstatusCancelacion: "Cancelado sin aceptación",
          ValidacionEFOS: "",
        },
      });
      expect(r.estado).toBe("Cancelado");
      expect(r.estatusCancelacion).toBe("Cancelado sin aceptación");
      expect(r.validacionEFOS).toBe("");
    });

    it("No Encontrado retorna estado No Encontrado y EFOS vacio", () => {
      const r = normalizeConsultaResult({
        ConsultaResult: {
          CodigoEstatus: "N - 602 comprobante no encontrado",
          Estado: "No Encontrado",
          EsCancelable: "",
          EstatusCancelacion: "",
          ValidacionEFOS: "",
        },
      });
      expect(r.estado).toBe("No Encontrado");
      expect(r.codigoEstatus).toMatch(/602/);
      expect(r.validacionEFOS).toBe("");
    });

    it("respeta codigo EFOS explicito cuando viene en el acuse", () => {
      const r = normalizeConsultaResult({
        ConsultaResult: {
          CodigoEstatus: "S",
          Estado: "Vigente",
          EsCancelable: "No cancelable",
          EstatusCancelacion: "",
          ValidacionEFOS: "100",
        },
      });
      expect(r.validacionEFOS).toBe("100");
    });

    it("acepta variante camelCase en la raiz (consultaResult)", () => {
      const r = normalizeConsultaResult({
        consultaResult: {
          codigoEstatus: "S",
          estado: "Vigente",
          esCancelable: "",
          estatusCancelacion: "",
          validacionEFOS: "",
        },
      });
      expect(r.estado).toBe("Vigente");
    });

    it("acepta variante envuelta en return", () => {
      const r = normalizeConsultaResult({
        return: {
          CodigoEstatus: "S",
          Estado: "Cancelado",
          EsCancelable: "",
          EstatusCancelacion: "Plazo vencido",
          ValidacionEFOS: "",
        },
      });
      expect(r.estado).toBe("Cancelado");
      expect(r.estatusCancelacion).toBe("Plazo vencido");
    });

    it("acepta payload plano sin envoltorio", () => {
      const r = normalizeConsultaResult({
        CodigoEstatus: "S",
        Estado: "Vigente",
      });
      expect(r.estado).toBe("Vigente");
      expect(r.validacionEFOS).toBe("200");
    });

    it("retorna cadenas vacias cuando el payload no es objeto", () => {
      const r = normalizeConsultaResult(null);
      expect(r.estado).toBe("");
      expect(r.codigoEstatus).toBe("");
      expect(r.validacionEFOS).toBe("");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Transformacion del acuse a fila de CFDI (snake_case)
  // ─────────────────────────────────────────────────────────────
  describe("acuseToCfdiRow", () => {
    it("mapea un acuse Vigente a columnas sat_*", () => {
      const row = acuseToCfdiRow({
        codigoEstatus: "S - Comprobante obtenido satisfactoriamente",
        estado: "Vigente",
        esCancelable: "Cancelable sin aceptación",
        estatusCancelacion: "",
        validacionEFOS: "200",
      });
      expect(row.sat_estado).toBe("Vigente");
      expect(row.sat_validacion_efos).toBe("200");
      expect(row.sat_es_cancelable).toBe("Cancelable sin aceptación");
      expect(row.sat_estatus_cancelacion).toBeNull();
    });

    it("mapea un acuse Cancelado preservando estatus de cancelacion", () => {
      const row = acuseToCfdiRow({
        codigoEstatus: "S",
        estado: "Cancelado",
        esCancelable: "",
        estatusCancelacion: "Cancelado sin aceptación",
        validacionEFOS: "",
      });
      expect(row.sat_estado).toBe("Cancelado");
      expect(row.sat_estatus_cancelacion).toBe("Cancelado sin aceptación");
      // EFOS vacio fallback a 200 para no fallar el insert de fila
      expect(row.sat_validacion_efos).toBe("200");
    });

    it("mapea un acuse No Encontrado", () => {
      const row = acuseToCfdiRow({
        codigoEstatus: "N - 602",
        estado: "No Encontrado",
        esCancelable: "",
        estatusCancelacion: "",
        validacionEFOS: "",
      });
      expect(row.sat_estado).toBe("No Encontrado");
      expect(row.sat_codigo_estatus).toMatch(/602/);
    });
  });
});
