/**
 * @file tests/models/gastoTramoModel.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  routeRequest: { findMany: jest.fn(), findFirst: jest.fn() },
  gastoTramo: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  receipt: { findMany: jest.fn() },
  request: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: mockPrisma,
}));

const GastoTramo = (await import("../../models/gastoTramoModel.js")).default;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("gastoTramoModel.getResumenTramos", () => {
  test("vincula comprobantes huérfanos cuando hay un solo tramo", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 23 });
    mockPrisma.routeRequest.findMany
      .mockResolvedValueOnce([{ route: { routeId: 5, routerIndex: 0 } }])
      .mockResolvedValueOnce([
        {
          route: {
            routeId: 5,
            routerIndex: 0,
            originCountry: { countryName: "MX" },
            originCity: { cityName: "CDMX" },
            destinationCountry: { countryName: "MX" },
            destinationCity: { cityName: "Monterrey" },
            beginningDate: new Date("2026-06-13"),
            endingDate: new Date("2026-07-04"),
            gastoTramos: [],
          },
        },
      ]);
    mockPrisma.gastoTramo.findMany.mockResolvedValue([]);
    mockPrisma.receipt.findMany
      .mockResolvedValueOnce([{ receiptId: 100 }])
      .mockResolvedValueOnce([]);
    mockPrisma.gastoTramo.findUnique.mockResolvedValue(null);
    mockPrisma.routeRequest.findFirst.mockResolvedValue({ requestId: 23, routeId: 5 });
    mockPrisma.gastoTramo.create.mockResolvedValue({ gastoTramoId: 1 });

    const resumen = await GastoTramo.getResumenTramos(23);

    expect(mockPrisma.gastoTramo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: 23,
          routeId: 5,
          receiptId: 100,
        }),
      }),
    );
    expect(resumen.tramos).toHaveLength(1);
  });
});
