import { jest, describe, test, expect, beforeEach } from "@jest/globals";

const mockEmployeeModel = {
  findByNoEmpleado: jest.fn(),
  createEmpleado: jest.fn(),
  updateEmpleado: jest.fn(),
};

await jest.unstable_mockModule("../../models/employeeModel.js", () => ({
  default: mockEmployeeModel,
}));

const { syncEmployee } = await import("../../services/employeeSyncService.js");

beforeEach(() => {
  jest.clearAllMocks();
});

const basePayload = {
  header: { idTransaction: "tx-1" },
  detalle: {
    noEmpleado: "Emp001",
    nombre: "Gabriela Peniche",
    email: "g@example.com",
    jefeInmediato: null,
    proveedor: "20000000008",
    ceco: "101",
    fechaAlta: "2026-01-01",
    tipo: "Alta",
  },
};

describe("employeeSyncService.syncEmployee", () => {
  test("Alta crea empleado cuando no existe", async () => {
    mockEmployeeModel.findByNoEmpleado.mockResolvedValue(null);
    const res = await syncEmployee(1n, basePayload, { user_id: 7 });
    expect(mockEmployeeModel.createEmpleado).toHaveBeenCalled();
    expect(res.accion_realizada).toBe("created");
  });

  test("Alta existente retorna 409", async () => {
    mockEmployeeModel.findByNoEmpleado.mockResolvedValue({ empleadoId: 1 });
    await expect(syncEmployee(1n, basePayload, { user_id: 7 })).rejects.toMatchObject({ status: 409 });
  });

  test("Baja actualiza solo status I", async () => {
    mockEmployeeModel.findByNoEmpleado.mockResolvedValue({ empleadoId: 1 });
    const payload = { ...basePayload, detalle: { ...basePayload.detalle, tipo: "Baja" } };
    const res = await syncEmployee(1n, payload, { user_id: 7 });
    expect(mockEmployeeModel.updateEmpleado).toHaveBeenCalledWith(1n, "Emp001", expect.objectContaining({ status: "I" }));
    expect(res.accion_realizada).toBe("deactivated");
  });

  test("Cambio actualiza campos sin forzar status", async () => {
    mockEmployeeModel.findByNoEmpleado.mockResolvedValue({ empleadoId: 1, status: "A" });
    const payload = { ...basePayload, detalle: { ...basePayload.detalle, tipo: "Cambio", nombre: "Nuevo Nombre" } };
    const res = await syncEmployee(1n, payload, { user_id: 7 });
    expect(mockEmployeeModel.updateEmpleado).toHaveBeenCalledWith(1n, "Emp001", expect.objectContaining({ nombre: "Nuevo Nombre" }));
    expect(res.accion_realizada).toBe("updated");
  });

  test("Reingreso activa status A", async () => {
    mockEmployeeModel.findByNoEmpleado.mockResolvedValue({ empleadoId: 1, status: "I" });
    const payload = { ...basePayload, detalle: { ...basePayload.detalle, tipo: "Reingreso" } };
    const res = await syncEmployee(1n, payload, { user_id: 7 });
    expect(mockEmployeeModel.updateEmpleado).toHaveBeenCalledWith(1n, "Emp001", expect.objectContaining({ status: "A" }));
    expect(res.accion_realizada).toBe("reactivated");
  });
});
