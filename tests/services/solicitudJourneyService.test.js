/**
 * @file tests/services/solicitudJourneyService.test.js
 */
import { describe, test, expect } from "@jest/globals";
import {
  approvalLevelsFromSnapshot,
  routeNeedsAgency,
  buildJourneyStepDefinitions,
  buildSolicitudJourney,
} from "../../services/solicitudJourneyService.js";

describe("solicitudJourneyService", () => {
  test("approvalLevelsFromSnapshot respeta niveles del snapshot", () => {
    expect(approvalLevelsFromSnapshot({ levels: [2] })).toEqual([2]);
    expect(approvalLevelsFromSnapshot(null)).toEqual([1, 2]);
  });

  test("routeNeedsAgency detecta hotel o vuelo", () => {
    expect(
      routeNeedsAgency([{ route: { hotelNeeded: false, planeNeeded: true } }]),
    ).toBe(true);
    expect(
      routeNeedsAgency([{ route: { hotelNeeded: false, planeNeeded: false } }]),
    ).toBe(false);
  });

  test("buildJourneyStepDefinitions omite N1 si solo aplica N2", () => {
    const defs = buildJourneyStepDefinitions({
      workflowPreSnapshot: { levels: [2] },
      routeRequests: [],
    });
    expect(defs.map((d) => d.key)).toEqual([
      "draft",
      "n2",
      "quote",
      "expenses",
      "validation",
      "done",
    ]);
  });

  test("buildSolicitudJourney marca pasos completados y pendientes", () => {
    const journey = buildSolicitudJourney({
      currentStatusId: 4,
      currentStatusLabel: "Cotización del Viaje",
      workflowPreSnapshot: { levels: [1, 2] },
      routeRequests: [],
      creationDate: new Date("2026-01-01T10:00:00Z"),
      historial: [
        {
          accion: "APROBADO",
          createdAt: new Date("2026-01-02T10:00:00Z"),
          user: { userName: "n1.user" },
        },
        {
          accion: "APROBADO",
          createdAt: new Date("2026-01-03T10:00:00Z"),
          user: { userName: "n2.user" },
        },
      ],
    });

    const byKey = Object.fromEntries(journey.steps.map((s) => [s.key, s]));
    expect(byKey.draft.state).toBe("completed");
    expect(byKey.n1.state).toBe("completed");
    expect(byKey.n1.actor).toBe("n1.user");
    expect(byKey.n2.state).toBe("completed");
    expect(byKey.quote.state).toBe("current");
    expect(byKey.expenses.state).toBe("pending");
    expect(journey.events).toHaveLength(2);
  });

  test("buildSolicitudJourney incluye agencia cuando aplica", () => {
    const journey = buildSolicitudJourney({
      currentStatusId: 5,
      workflowPreSnapshot: { levels: [1, 2] },
      routeRequests: [{ route: { hotelNeeded: true, planeNeeded: false } }],
      creationDate: new Date(),
      historial: [],
    });
    expect(journey.steps.some((s) => s.key === "agency")).toBe(true);
    expect(journey.steps.find((s) => s.key === "agency")?.state).toBe("current");
  });

  test("buildSolicitudJourney marca rechazo en el paso correcto", () => {
    const journey = buildSolicitudJourney({
      currentStatusId: 10,
      workflowPreSnapshot: { levels: [1, 2] },
      routeRequests: [],
      creationDate: new Date("2026-01-01T10:00:00Z"),
      historial: [
        {
          accion: "APROBADO",
          createdAt: new Date("2026-01-02T10:00:00Z"),
          user: { userName: "n1.user" },
        },
        {
          accion: "RECHAZADO",
          createdAt: new Date("2026-01-03T10:00:00Z"),
          comentario: "Fuera de política",
          user: { userName: "n2.user" },
        },
      ],
    });

    const byKey = Object.fromEntries(journey.steps.map((s) => [s.key, s]));
    expect(byKey.n1.state).toBe("completed");
    expect(byKey.n2.state).toBe("failed");
    expect(byKey.quote.state).toBe("cancelled");
    expect(journey.steps.find((s) => s.key === "rejected")).toBeTruthy();
  });
});
