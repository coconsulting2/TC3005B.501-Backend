/**
 * @file tests/services/satConsultaService.test.js
 * @description Pruebas unitarias de armado de expresionImpresa y normalizacion de acuse SAT.
 */
import { describe, it, expect } from "@jest/globals";
import {
  buildExpresionImpresa,
  normalizeConsultaResult,
} from "../../services/satConsultaService.js";

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
  });

  describe("normalizeConsultaResult", () => {
    it("lee ConsultaResult anidado y asigna EFOS 200 si Vigente sin codigo", () => {
      const r = normalizeConsultaResult({
        ConsultaResult: {
          CodigoEstatus: "S",
          Estado: "Vigente",
          EsCancelable: "Si",
          EstatusCancelacion: "",
          ValidacionEFOS: "",
        },
      });
      expect(r.estado).toBe("Vigente");
      expect(r.validacionEFOS).toBe("200");
    });
  });
});
