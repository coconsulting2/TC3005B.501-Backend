import {
  mapReceiptTypeToReportCategory,
  mapValidationToReportStatus,
} from "../../services/expenseReportService.js";

describe("expenseReportService maps", () => {
  test("mapReceiptTypeToReportCategory", () => {
    expect(mapReceiptTypeToReportCategory("Vuelo")).toBe("VIAJE_NACIONAL");
    expect(mapReceiptTypeToReportCategory("Hospedaje")).toBe("HOSPEDAJE");
    expect(mapReceiptTypeToReportCategory("Comida")).toBe("ALIMENTOS");
    expect(mapReceiptTypeToReportCategory("Transporte")).toBe("TRANSPORTE");
    expect(mapReceiptTypeToReportCategory("Otro")).toBe("OTROS");
    expect(mapReceiptTypeToReportCategory(null)).toBe("OTROS");
  });

  test("mapValidationToReportStatus", () => {
    expect(mapValidationToReportStatus("Rechazado", 2)).toBe("rejected");
    expect(mapValidationToReportStatus("Pendiente", 2)).toBe("submitted");
    expect(mapValidationToReportStatus("Aprobado", 2)).toBe("approved");
    expect(mapValidationToReportStatus("Aprobado", 8)).toBe("paid");
  });
});
