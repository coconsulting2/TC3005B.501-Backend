/**
 * @file tests/controllers/accountingExportController.test.js
 * @description Unit tests for the accounting export controller.
 * Se mockea el service para aislar la logica HTTP (negociacion JSON/XML, errores 400/404/409).
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

class NotFoundErrorStub extends Error { constructor(m) { super(m); this.status = 404; } }
class ConflictErrorStub extends Error { constructor(m) { super(m); this.status = 409; } }

const serviceMocks = {
    getPolizasForRequest: jest.fn(),
    getPolizasInRange: jest.fn(),
    polizasToXml: jest.fn(() => "<Polizas/>"),
    NotFoundError: NotFoundErrorStub,
    ConflictError: ConflictErrorStub,
};

await jest.unstable_mockModule("../../services/accountingExportService.js", () => ({
    default: serviceMocks,
}));

const { default: AccountingExportController } = await import(
    "../../controllers/accountingExportController.js"
);

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.type = jest.fn().mockReturnValue(res);
    return res;
};

beforeEach(() => {
    jest.clearAllMocks();
    serviceMocks.NotFoundError = NotFoundErrorStub;
    serviceMocks.ConflictError = ConflictErrorStub;
    serviceMocks.polizasToXml.mockReturnValue("<Polizas/>");
});

describe("exportByRequest", () => {
    test("200 JSON por default", async () => {
        serviceMocks.getPolizasForRequest.mockResolvedValue([{ header: {}, detalles: [] }]);
        const req = { params: { request_id: "222" }, query: {}, headers: {} };
        const res = mockRes();

        await AccountingExportController.exportByRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ polizas: [{ header: {}, detalles: [] }] });
        expect(res.type).not.toHaveBeenCalled();
    });

    test("200 XML cuando query.format=xml", async () => {
        serviceMocks.getPolizasForRequest.mockResolvedValue([]);
        const req = { params: { request_id: "222" }, query: { format: "xml" }, headers: {} };
        const res = mockRes();

        await AccountingExportController.exportByRequest(req, res);

        expect(res.type).toHaveBeenCalledWith("application/xml");
        expect(res.send).toHaveBeenCalledWith("<Polizas/>");
    });

    test("200 XML cuando Accept: application/xml", async () => {
        serviceMocks.getPolizasForRequest.mockResolvedValue([]);
        const req = { params: { request_id: "222" }, query: {}, headers: { accept: "application/xml" } };
        const res = mockRes();

        await AccountingExportController.exportByRequest(req, res);

        expect(res.type).toHaveBeenCalledWith("application/xml");
    });

    test("404 cuando el service tira NotFoundError", async () => {
        serviceMocks.getPolizasForRequest.mockRejectedValue(new NotFoundErrorStub("Travel request not found"));
        const req = { params: { request_id: "9999" }, query: {}, headers: {} };
        const res = mockRes();

        await AccountingExportController.exportByRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Travel request not found" });
    });

    test("409 cuando el service tira ConflictError", async () => {
        serviceMocks.getPolizasForRequest.mockRejectedValue(new ConflictErrorStub("not finalized"));
        const req = { params: { request_id: "1" }, query: {}, headers: {} };
        const res = mockRes();

        await AccountingExportController.exportByRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ error: "not finalized" });
    });

    test("500 cuando el service tira error generico", async () => {
        serviceMocks.getPolizasForRequest.mockRejectedValue(new Error("boom"));
        const req = { params: { request_id: "1" }, query: {}, headers: {} };
        const res = mockRes();

        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        await AccountingExportController.exportByRequest(req, res);
        spy.mockRestore();

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("exportByRange", () => {
    test("400 si falta 'from' o 'to'", async () => {
        const req = { query: {}, headers: {} };
        const res = mockRes();
        await AccountingExportController.exportByRange(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test("400 si 'from' > 'to'", async () => {
        const req = { query: { from: "2026-12-31", to: "2026-01-01" }, headers: {} };
        const res = mockRes();
        await AccountingExportController.exportByRange(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "'from' must be on or before 'to'" });
    });

    test("400 si fecha invalida", async () => {
        const req = { query: { from: "no-es-fecha", to: "2026-12-31" }, headers: {} };
        const res = mockRes();
        await AccountingExportController.exportByRange(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test("200 JSON con polizas vacias", async () => {
        serviceMocks.getPolizasInRange.mockResolvedValue([]);
        const req = { query: { from: "2026-01-01", to: "2026-12-31" }, headers: {} };
        const res = mockRes();
        await AccountingExportController.exportByRange(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ polizas: [] });
    });

    test("200 XML con format=xml", async () => {
        serviceMocks.getPolizasInRange.mockResolvedValue([{ header: {}, detalles: [] }]);
        const req = { query: { from: "2026-01-01", to: "2026-12-31", format: "xml" }, headers: {} };
        const res = mockRes();
        await AccountingExportController.exportByRange(req, res);
        expect(res.type).toHaveBeenCalledWith("application/xml");
        expect(res.send).toHaveBeenCalledWith("<Polizas/>");
    });

    test("convierte 'to' al final del dia antes de consultar", async () => {
        serviceMocks.getPolizasInRange.mockResolvedValue([]);
        const req = { query: { from: "2026-01-01", to: "2026-01-01" }, headers: {} };
        const res = mockRes();
        await AccountingExportController.exportByRange(req, res);
        const toArg = serviceMocks.getPolizasInRange.mock.calls[0][1];
        expect(toArg.getHours()).toBe(23);
        expect(toArg.getMinutes()).toBe(59);
    });
});
