/**
 * @file tests/controllers/authorizerController.notifications.test.js
 * @description Regresión: aprobar/rechazar vía /authorizer debe generar la
 * notificación in-app de workflow (US-20). Antes el controller solo mandaba
 * email y la campana nunca recibía la notificación al cambiar de estado.
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockAuthorizeRequest = jest.fn();
const mockDeclineRequest = jest.fn();

const mockNotifyApproved = jest.fn().mockResolvedValue(undefined);
const mockNotifyRejected = jest.fn().mockResolvedValue(undefined);
const mockNotifyEscalated = jest.fn().mockResolvedValue(undefined);

await jest.unstable_mockModule("../../models/authorizerModel.js", () => ({
  default: { getAlertsForAuthorizer: jest.fn() },
}));

await jest.unstable_mockModule("../../services/authorizerService.js", () => ({
  default: {
    authorizeRequest: mockAuthorizeRequest,
    declineRequest: mockDeclineRequest,
  },
}));

await jest.unstable_mockModule(
  "../../services/workflowNotificationService.js",
  () => ({
    notifyRequestApproved: mockNotifyApproved,
    notifyRequestRejected: mockNotifyRejected,
    notifyRequestEscalated: mockNotifyEscalated,
    // notifySafe ejecuta la fn directo para poder observar la llamada interna.
    notifySafe: (fn) => fn(),
  }),
);

const { default: authorizerController } = await import(
  "../../controllers/authorizerController.js"
);

function makeRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe("authorizerController notifications (regresión campana)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("authorizeTravelRequest aprobado notifica al solicitante", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      new_status: 4,
      outcome: "APROBADO",
    });
    const req = {
      params: { request_id: "7", user_id: "10" },
      user: { user_id: 10 },
      body: {},
    };
    const res = makeRes();

    await authorizerController.authorizeTravelRequest(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockNotifyApproved).toHaveBeenCalledWith(7, 10);
    expect(mockNotifyEscalated).not.toHaveBeenCalled();
  });

  test("authorizeTravelRequest escalado notifica al N2 (no al solicitante)", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      new_status: 3,
      outcome: "ESCALADO",
    });
    const req = {
      params: { request_id: "8", user_id: "10" },
      user: { user_id: 10 },
      body: {},
    };
    const res = makeRes();

    await authorizerController.authorizeTravelRequest(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockNotifyEscalated).toHaveBeenCalledWith(8);
    expect(mockNotifyApproved).not.toHaveBeenCalled();
  });

  test("declineTravelRequest notifica el rechazo con el motivo", async () => {
    mockDeclineRequest.mockResolvedValue({ message: "rechazada" });
    const req = {
      params: { request_id: "9", user_id: "10" },
      user: { user_id: 10 },
      body: { comentario: "Documentación incompleta" },
    };
    const res = makeRes();

    await authorizerController.declineTravelRequest(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockNotifyRejected).toHaveBeenCalledWith(
      9,
      "Documentación incompleta",
    );
  });

  test("no notifica si el actor no coincide con el usuario del token (403)", async () => {
    const req = {
      params: { request_id: "7", user_id: "10" },
      user: { user_id: 99 },
      body: {},
    };
    const res = makeRes();

    await authorizerController.authorizeTravelRequest(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockAuthorizeRequest).not.toHaveBeenCalled();
    expect(mockNotifyApproved).not.toHaveBeenCalled();
    expect(mockNotifyEscalated).not.toHaveBeenCalled();
  });
});
