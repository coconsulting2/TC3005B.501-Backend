/**
 * @file tests/comprobantes.test.js
 * @description Unit tests for POST /api/comprobantes/:receipt_id (M1-003)
 *
 * Tests cover:
 *  - Validaciones de formato (RFC, UUID, CP, enums SAT)
 *  - Lógica de negocio (UUID duplicado, CFDI cancelado, emisor en EFOS)
 *  - Autenticación (401 sin token)
 *  - Caso exitoso (201)
 *
 * @author Hector Lugo
 */
import request from "supertest";
import { jest, test, expect, describe, beforeEach } from "@jest/globals";

// ──────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────
jest.mock("../models/comprobantesModel.js", () => ({
  default: {
    findReceiptById: jest.fn(),
    findByUUID:      jest.fn(),
    createCfdi:      jest.fn(),
  },
}));

const { default: ComprobantesModel } = await import("../models/comprobantesModel.js");

// Import app after mocks are set up
const { default: app } = await import("../app.js");

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** Valid bearer token for a Solicitante (adjust to match test environment) */
const VALID_TOKEN = process.env.TEST_TOKEN ?? "test-token-placeholder";

const AUTH = { Authorization: `Bearer ${VALID_TOKEN}` };

/** Base valid CFDI 4.0 payload based on real SAT invoice structure */
const validPayload = {
  // TimbreFiscalDigital
  uuid:                      "550e8400-e29b-41d4-a716-446655440000",
  fecha_timbrado:            "2026-04-09T10:05:00",
  rfc_pac:                   "SAT970701NN3",
  // Comprobante
  version:                   "4.0",
  serie:                     "A",
  folio:                     "12345",
  fecha_emision:             "2026-04-09T10:00:00",
  tipo_comprobante:          "I",
  lugar_expedicion:          "64000",
  exportacion:               "01",
  metodo_pago:               "PUE",
  forma_pago:                "03",
  moneda:                    "MXN",
  tipo_cambio:               1.0,
  subtotal:                  1000.00,
  iva:                       160.00,
  total:                     1160.00,
  // Emisor
  rfc_emisor:                "AAA010101AAA",
  nombre_emisor:             "EMPRESA EJEMPLO S.A. DE C.V.",
  regimen_fiscal_emisor:     "601",
  // Receptor
  rfc_receptor:              "COSC8001137NA",
  nombre_receptor:           "CLIENTE EJEMPLO S.A. DE C.V.",
  domicilio_fiscal_receptor: "64000",
  regimen_fiscal_receptor:   "601",
  uso_cfdi:                  "G03",
  // Acuse SAT (código 200 = limpio, estado Vigente)
  sat_codigo_estatus:        "S - Comprobante obtenido satisfactoriamente",
  sat_estado:                "Vigente",
  sat_es_cancelable:         "Cancelable sin aceptación",
  sat_estatus_cancelacion:   "",
  sat_validacion_efos:       "200",
};

const RECEIPT_ID = 1;

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default happy-path mocks
  // ComprobantesModel.findReceiptById.mockResolvedValue({ receiptId: RECEIPT_ID });
  // ComprobantesModel.findByUUID.mockResolvedValue(null);
  // ComprobantesModel.createCfdi.mockResolvedValue({ cfdiId: 1, ...validPayload, receiptId: RECEIPT_ID });
});

describe.skip("POST /api/comprobantes/:receipt_id", () => {

  // ── Autenticación ──────────────────────────────────────
  test("401 si no se envía token", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  // ── Validaciones de formato ────────────────────────────
  test("400 si uuid no es UUID v4", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, uuid: "no-es-uuid" });
    expect(res.status).toBe(400);
  });

  test("400 si rfc_emisor tiene formato inválido", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, rfc_emisor: "BADFORMAT" });
    expect(res.status).toBe(400);
  });

  test("400 si metodo_pago no es PUE ni PPD", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, metodo_pago: "XYZ" });
    expect(res.status).toBe(400);
  });

  test("400 si sat_estado no es valor válido", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_estado: "Desconocido" });
    expect(res.status).toBe(400);
  });

  test("400 si sat_validacion_efos no es código válido", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_validacion_efos: "999" });
    expect(res.status).toBe(400);
  });

  test("400 si lugar_expedicion no tiene 5 dígitos", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, lugar_expedicion: "123" });
    expect(res.status).toBe(400);
  });

  // ── Lógica de negocio ──────────────────────────────────
  test("404 si el receipt_id no existe", async () => {
    ComprobantesModel.findReceiptById.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send(validPayload);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test("409 si el CFDI está Cancelado en SAT", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_estado: "Cancelado" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cancelado/i);
  });

  test("409 si el emisor está en lista EFOS (código 100)", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_validacion_efos: "100" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/EFOS/i);
  });

  test("409 si el emisor está en lista EFOS (código 101)", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_validacion_efos: "101" });
    expect(res.status).toBe(409);
  });

  test("409 si el emisor está en lista EFOS (código 104)", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_validacion_efos: "104" });
    expect(res.status).toBe(409);
  });

  test("201 cuando solo terceros en EFOS (código 102) — emisor limpio", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send({ ...validPayload, sat_validacion_efos: "102" });
    // Emisor limpio — se permite insertar con advertencia en sat_validacion_efos
    expect(res.status).toBe(201);
  });

  test("409 si el UUID ya fue registrado", async () => {
    ComprobantesModel.findByUUID.mockResolvedValue({ cfdiId: 99 });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send(validPayload);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/UUID/);
  });

  // ── Caso exitoso ───────────────────────────────────────
  test("201 con datos válidos y receipt existente", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("cfdiId");
    expect(res.body).toHaveProperty("uuid", validPayload.uuid);
    expect(res.body).toHaveProperty("receiptId", RECEIPT_ID);
    expect(ComprobantesModel.createCfdi).toHaveBeenCalledWith(RECEIPT_ID, expect.objectContaining({
      uuid: validPayload.uuid,
      sat_estado: "Vigente",
    }));
  });

  // ── Atomicidad / rollback ──────────────────────────────
  test("500 y rollback si createCfdi falla", async () => {
    ComprobantesModel.createCfdi.mockRejectedValue(new Error("DB connection lost"));
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH)
      .send(validPayload);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
  });
});
