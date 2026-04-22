/**
 * @file tests/comprobantes.test.js
 * @description Pruebas de integración: POST /api/comprobantes y PUT validate-receipt (SAT / CPP).
 *
 * Entorno recomendado (misma DB/Mongo/JWT que en desarrollo):
 *   bun run docker:test
 * Ver `docker-compose.dev.yml` (servicio `backend`: DATABASE_URL, JWT_SECRET, etc.).
 *
 * @author Hector Lugo
 */
import request from "supertest";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

dotenv.config();
process.env.JWT_SECRET ??= "jest-secret-comprobantes-sat";
process.env.NODE_ENV ??= "test";

// ──────────────────────────────────────────────────────────
// Mocks ESM: `jest.mock` no sustituye módulos cargados vía `import()`; usar
// `unstable_mockModule` antes de cualquier `import()` del módulo bajo prueba.
// ──────────────────────────────────────────────────────────
await jest.unstable_mockModule("../../../models/accountsPayableModel.js", () => ({
  default: {
    attendTravelRequest: jest.fn(),
    requestExists: jest.fn(),
    getReceiptStatusesForRequest: jest.fn(),
    updateRequestStatus: jest.fn(),
    receiptExists: jest.fn(),
    findReceiptForValidation: jest.fn(),
    validateReceipt: jest.fn().mockResolvedValue(true),
    getExpenseValidations: jest.fn(),
  },
}));

await jest.unstable_mockModule("../../../services/satConsultaService.js", () => ({
  consultarCfdiWithRetries: jest.fn(),
  acuseToCfdiRow: (a) => ({
    sat_codigo_estatus: a.codigoEstatus,
    sat_estado: a.estado,
    sat_es_cancelable: a.esCancelable || null,
    sat_estatus_cancelacion: a.estatusCancelacion || null,
    sat_validacion_efos: a.validacionEFOS || "200",
  }),
}));

await jest.unstable_mockModule("../../../models/comprobantesModel.js", () => ({
  default: {
    findReceiptById: jest.fn(),
    findByUUID: jest.fn(),
    createCfdi: jest.fn(),
    updateSatAcuseByReceiptId: jest.fn().mockResolvedValue({}),
  },
}));

/** Política de carga de comprobantes (insertarCfdi) consulta estado de solicitud vía Prisma; se simula aquí. */
await jest.unstable_mockModule("../../../models/applicantModel.js", () => ({
  default: {
    getRequestStatus: jest.fn().mockResolvedValue(7),
  },
}));

const { default: ComprobantesModel } = await import("../../../models/comprobantesModel.js");
const { default: Applicant } = await import("../../../models/applicantModel.js");
const { default: AccountsPayable } = await import("../../../models/accountsPayableModel.js");
const { consultarCfdiWithRetries } = await import("../../../services/satConsultaService.js");
const { default: app } = await import("../../../app.js");

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** Bearer JWT Solicitante alineado con JWT_SECRET (IP 127.0.0.1) */
const VALID_TOKEN =
  process.env.TEST_TOKEN ??
  jwt.sign(
    { user_id: 1, role: "Solicitante", ip: "127.0.0.1" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );

const AUTH = { Authorization: `Bearer ${VALID_TOKEN}` };
const AUTH_HEADERS = { ...AUTH, "x-forwarded-for": "127.0.0.1" };

const cppToken = () =>
  jwt.sign(
    { user_id: 1, role: "Cuentas por pagar", ip: "127.0.0.1" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );

const CPP_AUTH_HEADERS = {
  Authorization: `Bearer ${cppToken()}`,
  "x-forwarded-for": "127.0.0.1",
};

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
  // Opcional: Sello del XML (>=8 chars) para parametro fe en consulta SAT
  sello_emisor:              "0123456789ABCDEF0123456789ABCDEF",
};

const RECEIPT_ID = 1;
/** Debe existir en el mock de receipt para pasar insertarCfdi → assertRequestAllowsReceiptUpload */
const MOCK_REQUEST_ID = 42;

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

const vigenteSat = () => ({
  codigoEstatus: "S - Comprobante obtenido satisfactoriamente",
  estado: "Vigente",
  esCancelable: "Cancelable sin aceptación",
  estatusCancelacion: "",
  validacionEFOS: "200",
});

beforeEach(() => {
  // mockClear (not clearAllMocks) keeps jest.fn() implementations usable on ComprobantesModel
  ComprobantesModel.findReceiptById.mockClear();
  ComprobantesModel.findByUUID.mockClear();
  ComprobantesModel.createCfdi.mockClear();
  ComprobantesModel.updateSatAcuseByReceiptId.mockClear();
  Applicant.getRequestStatus.mockClear();
  Applicant.getRequestStatus.mockResolvedValue(7);
  AccountsPayable.findReceiptForValidation.mockClear();
  AccountsPayable.validateReceipt.mockClear();
  AccountsPayable.validateReceipt.mockResolvedValue(true);
  consultarCfdiWithRetries.mockClear();
  consultarCfdiWithRetries.mockResolvedValue(vigenteSat());
  // Default happy-path mocks (requestId requerido por insertarCfdi + política N2)
  ComprobantesModel.findReceiptById.mockResolvedValue({
    receiptId: RECEIPT_ID,
    requestId: MOCK_REQUEST_ID,
  });
  ComprobantesModel.findByUUID.mockResolvedValue(null);
  ComprobantesModel.createCfdi.mockResolvedValue({ cfdiId: 1, ...validPayload, receiptId: RECEIPT_ID });
});

describe("POST /api/comprobantes/:receipt_id", () => {

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
      .set(AUTH_HEADERS)
      .send({ ...validPayload, uuid: "no-es-uuid" });
    expect(res.status).toBe(400);
  });

  test("400 si rfc_emisor tiene formato inválido", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send({ ...validPayload, rfc_emisor: "BADFORMAT" });
    expect(res.status).toBe(400);
  });

  test("400 si metodo_pago no es PUE ni PPD", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send({ ...validPayload, metodo_pago: "XYZ" });
    expect(res.status).toBe(400);
  });

  test("400 si lugar_expedicion no tiene 5 dígitos", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send({ ...validPayload, lugar_expedicion: "123" });
    expect(res.status).toBe(400);
  });

  // ── Lógica de negocio ──────────────────────────────────
  test("404 si el receipt_id no existe", async () => {
    ComprobantesModel.findReceiptById.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test("409 si el CFDI está Cancelado en SAT", async () => {
    consultarCfdiWithRetries.mockResolvedValue({
      ...vigenteSat(),
      estado: "Cancelado",
    });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cancelado|estado SAT/i);
  });

  test("409 si el emisor está en lista EFOS (código 100)", async () => {
    consultarCfdiWithRetries.mockResolvedValue({
      ...vigenteSat(),
      validacionEFOS: "100",
    });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/EFOS/i);
  });

  test("409 si el emisor está en lista EFOS (código 101)", async () => {
    consultarCfdiWithRetries.mockResolvedValue({
      ...vigenteSat(),
      validacionEFOS: "101",
    });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(409);
  });

  test("409 si el emisor está en lista EFOS (código 104)", async () => {
    consultarCfdiWithRetries.mockResolvedValue({
      ...vigenteSat(),
      validacionEFOS: "104",
    });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(409);
  });

  test("201 cuando solo terceros en EFOS (código 102) — emisor limpio", async () => {
    consultarCfdiWithRetries.mockResolvedValue({
      ...vigenteSat(),
      validacionEFOS: "102",
    });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(201);
  });

  test("503 si la consulta SAT falla tras reintentos", async () => {
    consultarCfdiWithRetries.mockRejectedValue(new Error("SAT_UNAVAILABLE"));
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/SAT|consultar/i);
  });

  test("409 si el UUID ya fue registrado", async () => {
    ComprobantesModel.findByUUID.mockResolvedValue({ cfdiId: 99 });
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/UUID/);
  });

  // ── Caso exitoso ───────────────────────────────────────
  test("201 con datos válidos y receipt existente", async () => {
    const res = await request(app)
      .post(`/api/comprobantes/${RECEIPT_ID}`)
      .set(AUTH_HEADERS)
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
      .set(AUTH_HEADERS)
      .send(validPayload);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
  });
});

// ── PUT validate-receipt (CPP + SAT); mismos mocks / `app` que POST comprobantes ──

const mockCfdiApprove = {
  rfcEmisor: "AAA010101AAA",
  rfcReceptor: "COSC8001137NA",
  total: 1160,
  uuid: "550e8400-e29b-41d4-a716-446655440000",
};

const vigenteSatAp = () => ({
  codigoEstatus: "S",
  estado: "Vigente",
  esCancelable: "",
  estatusCancelacion: "",
  validacionEFOS: "200",
});

describe("PUT /api/accounts-payable/validate-receipt/:receipt_id (SAT)", () => {
  beforeEach(() => {
    AccountsPayable.findReceiptForValidation.mockReset();
    AccountsPayable.validateReceipt.mockReset();
    AccountsPayable.validateReceipt.mockResolvedValue(true);
    ComprobantesModel.updateSatAcuseByReceiptId.mockClear();
    consultarCfdiWithRetries.mockReset();
    consultarCfdiWithRetries.mockResolvedValue(vigenteSatAp());
  });

  test("409 si SAT no devuelve Vigente al aprobar", async () => {
    AccountsPayable.findReceiptForValidation.mockResolvedValue({
      receipt_id: 10,
      validation: "Pendiente",
      cfdiComprobante: mockCfdiApprove,
    });
    consultarCfdiWithRetries.mockResolvedValue({
      ...vigenteSatAp(),
      estado: "Cancelado",
    });
    const res = await request(app)
      .put("/api/accounts-payable/validate-receipt/10")
      .set(CPP_AUTH_HEADERS)
      .send({ approval: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/SAT/i);
    expect(AccountsPayable.validateReceipt).not.toHaveBeenCalled();
  });

  test("409 si no hay CFDI y se aprueba", async () => {
    AccountsPayable.findReceiptForValidation.mockResolvedValue({
      receipt_id: 11,
      validation: "Pendiente",
      cfdiComprobante: null,
    });
    const res = await request(app)
      .put("/api/accounts-payable/validate-receipt/11")
      .set(CPP_AUTH_HEADERS)
      .send({ approval: 1 });
    expect(res.status).toBe(409);
    expect(AccountsPayable.validateReceipt).not.toHaveBeenCalled();
  });

  test("503 si la consulta SAT falla al aprobar", async () => {
    AccountsPayable.findReceiptForValidation.mockResolvedValue({
      receipt_id: 13,
      validation: "Pendiente",
      cfdiComprobante: mockCfdiApprove,
    });
    consultarCfdiWithRetries.mockRejectedValue(new Error("SAT_UNAVAILABLE"));
    const res = await request(app)
      .put("/api/accounts-payable/validate-receipt/13")
      .set(CPP_AUTH_HEADERS)
      .send({ approval: 1 });
    expect(res.status).toBe(503);
    expect(AccountsPayable.validateReceipt).not.toHaveBeenCalled();
  });

  test("200 al aprobar con Vigente y actualiza acuse", async () => {
    AccountsPayable.findReceiptForValidation.mockResolvedValue({
      receipt_id: 12,
      validation: "Pendiente",
      cfdiComprobante: mockCfdiApprove,
    });
    const res = await request(app)
      .put("/api/accounts-payable/validate-receipt/12")
      .set(CPP_AUTH_HEADERS)
      .send({ approval: 1 });
    expect(res.status).toBe(200);
    expect(ComprobantesModel.updateSatAcuseByReceiptId).toHaveBeenCalled();
    expect(AccountsPayable.validateReceipt).toHaveBeenCalledWith(12, 2);
  });

  test("rechazar no llama al SAT", async () => {
    AccountsPayable.findReceiptForValidation.mockResolvedValue({
      receipt_id: 14,
      validation: "Pendiente",
      cfdiComprobante: mockCfdiApprove,
    });
    const res = await request(app)
      .put("/api/accounts-payable/validate-receipt/14")
      .set(CPP_AUTH_HEADERS)
      .send({ approval: 0 });
    expect(res.status).toBe(200);
    expect(consultarCfdiWithRetries).not.toHaveBeenCalled();
  });
});
