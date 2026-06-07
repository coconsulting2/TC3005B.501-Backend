/**
 * @file tests/services/comprobantesInternational.test.js
 * @description insertarComprobanteInternacional persiste tipoCambio vía fxPublicService.
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockGetFxRate = jest.fn().mockResolvedValue(17.25);

await jest.unstable_mockModule("../../services/fxPublicService.js", () => ({
  getFxRateToTarget: mockGetFxRate,
  convertAmount: jest.fn(),
}));

await jest.unstable_mockModule("../../services/requestReceiptUploadPolicy.js", () => ({
  assertRequestAllowsReceiptUpload: jest.fn().mockResolvedValue(undefined),
}));

const txClient = {
  receipt: { update: jest.fn().mockResolvedValue({}) },
  cfdiComprobante: { create: jest.fn() },
};

const mockPrisma = {
  cfdiComprobante: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn) => fn(txClient)),
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({ default: mockPrisma }));

await jest.unstable_mockModule("../../models/comprobantesModel.js", () => ({
  default: {
    findReceiptById: jest.fn(),
  },
}));

const ComprobantesModel = (await import("../../models/comprobantesModel.js")).default;
const { insertarComprobanteInternacional } = await import("../../services/comprobantesService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFxRate.mockResolvedValue(17.25);
  mockPrisma.cfdiComprobante.findUnique.mockResolvedValue(null);
  ComprobantesModel.findReceiptById.mockResolvedValue({
    receiptId: 99,
    requestId: 10,
    organizationId: 101n,
  });
  txClient.cfdiComprobante.create.mockImplementation(({ data }) => Promise.resolve(data));
});

describe("insertarComprobanteInternacional", () => {
  test("persiste tipoCambio > 1 para moneda USD", async () => {
    const body = {
      descripcion: "Lounge aeropuerto",
      fecha_emision: "2026-06-07T12:00:00.000Z",
      moneda: "USD",
      total: 45,
      receipt_type_id: 2,
    };

    const result = await insertarComprobanteInternacional(99, body);

    expect(mockGetFxRate).toHaveBeenCalledWith("USD", "MXN");
    expect(txClient.cfdiComprobante.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moneda: "USD",
          tipoCambio: 17.25,
          tipoComprobante: "INTERNACIONAL",
          satEstado: "Internacional",
        }),
      }),
    );
    expect(result.tipoCambio).toBe(17.25);
  });

  test("MXN usa tipoCambio 1 sin llamar FX", async () => {
    await insertarComprobanteInternacional(99, {
      descripcion: "Gasto local",
      fecha_emision: "2026-06-07T12:00:00.000Z",
      moneda: "MXN",
      total: 100,
    });

    expect(mockGetFxRate).not.toHaveBeenCalled();
    expect(txClient.cfdiComprobante.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipoCambio: 1 }),
      }),
    );
  });

  test("503 si Frankfurter falla", async () => {
    mockGetFxRate.mockRejectedValue(new Error("FX provider error"));

    await expect(
      insertarComprobanteInternacional(99, {
        descripcion: "Test",
        fecha_emision: "2026-06-07T12:00:00.000Z",
        moneda: "EUR",
        total: 50,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
