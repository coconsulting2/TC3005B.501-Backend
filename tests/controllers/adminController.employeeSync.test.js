import { jest, describe, test, expect, beforeEach } from "@jest/globals";

const mockEmployeeSyncService = {
  syncEmployee: jest.fn(),
};

await jest.unstable_mockModule("../../services/employeeSyncService.js", () => ({
  default: mockEmployeeSyncService,
}));

const { syncEmployee } = await import("../../controllers/adminController.js");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("adminController.syncEmployee", () => {
  test("200 cuando sync es exitoso", async () => {
    mockEmployeeSyncService.syncEmployee.mockResolvedValue({
      idTransaction: "tx",
      status: "success",
      noEmpleado: "Emp001",
      accion_realizada: "created",
    });
    const req = {
      user: { organization_id: "1", user_id: 7 },
      body: { header: { idTransaction: "tx" }, detalle: { noEmpleado: "Emp001" } },
    };
    const res = mockRes();
    await syncEmployee(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  test("401 si falta organization_id en token", async () => {
    const req = { user: {}, body: {} };
    const res = mockRes();
    await syncEmployee(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("propaga error estructurado cuando falla el servicio", async () => {
    mockEmployeeSyncService.syncEmployee.mockRejectedValue({ status: 409, message: "Empleado existe" });
    const req = {
      user: { organization_id: "1", user_id: 7 },
      body: { header: { idTransaction: "tx" }, detalle: { noEmpleado: "Emp001" } },
    };
    const res = mockRes();
    await syncEmployee(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });
});
