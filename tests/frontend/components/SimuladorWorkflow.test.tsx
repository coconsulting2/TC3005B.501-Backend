/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Unit tests for SimuladorWorkflow. Covers the initial render of the
 * parameters form, the validation error path for an invalid amount,
 * the success path that prefers the remote API response when one is
 * available, the local-fallback path that runs the bundled rule set
 * when the API call fails, and the reset button clearing the
 * previous result.
 */

import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import SimuladorWorkflow from "@components/SimuladorWorkflow";
import { server } from "../mocks/server";

const API = "https://localhost:3000/api";

describe("SimuladorWorkflow", () => {
  it("renders the parameters form with the default values", () => {
    render(<SimuladorWorkflow />);
    expect(
      screen.getByRole("heading", { name: /simulación de flujo de aprobación/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/monto/i)).toHaveValue(15000);
    expect(screen.getByLabelText(/tipo de gasto/i)).toHaveValue("viaje_nacional");
    expect(screen.getByLabelText(/destino/i)).toHaveValue("nacional");
    expect(screen.getByRole("button", { name: /simular flujo/i })).toBeInTheDocument();
  });

  it("shows a validation error and clears any previous result when monto is zero or negative", async () => {
    const user = userEvent.setup();
    render(<SimuladorWorkflow />);

    const monto = screen.getByLabelText(/monto/i);
    await user.clear(monto);
    await user.type(monto, "0");
    await user.click(screen.getByRole("button", { name: /simular flujo/i }));

    expect(
      await screen.findByText(/ingresa un monto mayor a cero/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ruta de aprobación/i)).not.toBeInTheDocument();
  });

  it("shows the remote simulation result when the API call succeeds", async () => {
    server.use(
      http.post(`${API}/workflow/simulate`, () =>
        HttpResponse.json({
          input: { monto: 15000, tipo_gasto: "viaje_nacional", destino: "nacional" },
          steps: [
            {
              level: 1,
              role: "remote",
              role_label: "Aprobador remoto",
              limit: 50000,
              status: "pending",
            },
          ],
          total_levels: 1,
          auto_approved: false,
          escalation_triggered: false,
          summary: "Respuesta del backend simulada.",
        }),
      ),
    );
    const user = userEvent.setup();
    render(<SimuladorWorkflow apiEndpoint="/workflow/simulate" token="t" />);
    await user.click(screen.getByRole("button", { name: /simular flujo/i }));

    expect(
      await screen.findByText(/respuesta del backend simulada/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Aprobador remoto")).toBeInTheDocument();
    expect(screen.getByText("1 nivel")).toBeInTheDocument();
  });

  it("falls back to the local rule set when the API endpoint fails", async () => {
    server.use(
      http.post(`${API}/workflow/simulate`, () =>
        HttpResponse.json({ error: "down" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<SimuladorWorkflow apiEndpoint="/workflow/simulate" />);

    const monto = screen.getByLabelText(/monto/i);
    await user.clear(monto);
    await user.type(monto, "150000");
    await user.click(screen.getByRole("button", { name: /simular flujo/i }));

    expect(await screen.findByText("Autorizador N1")).toBeInTheDocument();
    expect(screen.getByText("Autorizador N2")).toBeInTheDocument();
    expect(screen.getByText("Director de Finanzas")).toBeInTheDocument();
    expect(screen.getAllByText(/escalación/i).length).toBeGreaterThan(0);
  });

  it("auto-approves a small national non-international expense via the local fallback", async () => {
    server.use(
      http.post(`${API}/workflow/simulate`, () =>
        HttpResponse.json({ error: "down" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<SimuladorWorkflow apiEndpoint="/workflow/simulate" />);

    const monto = screen.getByLabelText(/monto/i);
    await user.clear(monto);
    await user.type(monto, "1000");
    await user.click(screen.getByRole("button", { name: /simular flujo/i }));

    const matches = await screen.findAllByText(/aprobación automática/i);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/auto-aprobado/i)).toBeInTheDocument();
  });

  it("appends a treasury step when destination is international", async () => {
    server.use(
      http.post(`${API}/workflow/simulate`, () =>
        HttpResponse.json({ error: "down" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<SimuladorWorkflow apiEndpoint="/workflow/simulate" />);

    await user.selectOptions(screen.getByLabelText(/destino/i), "internacional");
    await user.click(screen.getByRole("button", { name: /simular flujo/i }));

    expect(await screen.findByText(/tesorería/i)).toBeInTheDocument();
  });

  it("clears the result and resets the form when the limpiar button is clicked", async () => {
    server.use(
      http.post(`${API}/workflow/simulate`, () =>
        HttpResponse.json({ error: "down" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<SimuladorWorkflow apiEndpoint="/workflow/simulate" />);

    await user.click(screen.getByRole("button", { name: /simular flujo/i }));
    await waitFor(() => {
      expect(screen.getByText("Autorizador N1")).toBeInTheDocument();
    });

    const monto = screen.getByLabelText(/monto/i);
    await user.clear(monto);
    await user.type(monto, "999");

    await user.click(screen.getByRole("button", { name: /limpiar/i }));

    expect(screen.queryByText("Autorizador N1")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/monto/i)).toHaveValue(15000);
  });
});
