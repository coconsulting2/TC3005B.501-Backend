import { describe, expect, test } from "@jest/globals";
import { clampStaysSearchRadiusKm, isStaysAccessDeniedError } from "../../services/duffelStaysApi.js";
import { resolveCityToCoordinates } from "../../services/duffelStaysProvider.js";

describe("duffelStaysApi", () => {
  test("clampStaysSearchRadiusKm acota entre 1 y 100", () => {
    expect(clampStaysSearchRadiusKm(20000)).toBe(100);
    expect(clampStaysSearchRadiusKm(0)).toBe(1);
    expect(clampStaysSearchRadiusKm(10)).toBe(10);
    expect(clampStaysSearchRadiusKm(NaN)).toBe(10);
  });

  test("isStaysAccessDeniedError detecta 403 y mensaje", () => {
    expect(isStaysAccessDeniedError({ status: 403 })).toBe(true);
    expect(isStaysAccessDeniedError({ staysNotEnabled: true })).toBe(true);
    expect(
      isStaysAccessDeniedError({
        message: "This feature is not enabled for your account. Please contact sales",
      }),
    ).toBe(true);
    expect(isStaysAccessDeniedError({ message: "invalid date" })).toBe(false);
  });
});

describe("resolveCityToCoordinates", () => {
  test("resuelve ciudades MX conocidas", () => {
    const mty = resolveCityToCoordinates("Monterrey, México");
    expect(mty.latitude).toBeCloseTo(25.6866, 2);
    const cun = resolveCityToCoordinates("Cancún");
    expect(cun.latitude).toBeCloseTo(21.1619, 2);
  });

  test("fallback CDMX para texto desconocido", () => {
    const coords = resolveCityToCoordinates("Otra Ciudad");
    expect(coords.latitude).toBeCloseTo(19.4326, 2);
  });
});
