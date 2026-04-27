/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Unit tests for AuthRequestsList — the approval inbox that wraps
 * DataTable + Pagination for N1 / N2. Covers the empty state
 * fallback ("Cargando datos..." rendered by DataTable when there
 * are no rows), rendering of a single page of requests with the
 * mapped columns, the action column linking to the right URL based
 * on role, and pagination behaviour when there are more than 10
 * requests.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthRequestsList from "@components/RequestsLists/AuthRequestsList";

function makeRequest(id: number, overrides: Record<string, any> = {}) {
  return {
    request_id: id,
    request_status: "Primera Revisión",
    destination_country: `Destino ${id}`,
    beginning_date: "2026-04-10",
    ending_date: "2026-04-15",
    requester_name: `Usuario ${id}`,
    department_name: "Marketing",
    ...overrides,
  };
}

describe("AuthRequestsList", () => {
  it("falls back to the loading copy when the data array is empty", () => {
    render(<AuthRequestsList data={[]} role="N1" />);
    expect(screen.getByText(/cargando datos/i)).toBeInTheDocument();
  });

  it("renders the column headers expected by the inbox", () => {
    render(<AuthRequestsList data={[makeRequest(101)]} role="N1" />);
    expect(screen.getByText("ID Viaje")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Destino")).toBeInTheDocument();
    expect(screen.getByText("Fecha Salida")).toBeInTheDocument();
    expect(screen.getByText("Fecha Llegada")).toBeInTheDocument();
    expect(screen.getByText("Acciones")).toBeInTheDocument();
  });

  it("maps each request into a row with the expected fields", () => {
    const data = [
      makeRequest(101, { destination_country: "España" }),
      makeRequest(102, { destination_country: "Japón" }),
    ];
    render(<AuthRequestsList data={data} role="N1" />);

    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("España")).toBeInTheDocument();
    expect(screen.getByText("102")).toBeInTheDocument();
    expect(screen.getByText("Japón")).toBeInTheDocument();
    expect(screen.getAllByText("Primera Revisión")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /ver más/i })).toHaveLength(2);
  });

  it("links the action button to /autorizar-solicitud/<id> for an N1 reviewer", () => {
    render(<AuthRequestsList data={[makeRequest(555)]} role="N1" />);
    const link = screen.getByRole("button", { name: /ver más/i }).closest("a");
    expect(link).toHaveAttribute("href", "/autorizar-solicitud/555");
  });

  it("links the action button to /autorizar-solicitud/<id> for an N2 reviewer", () => {
    render(<AuthRequestsList data={[makeRequest(777)]} role="N2" />);
    const link = screen.getByRole("button", { name: /ver más/i }).closest("a");
    expect(link).toHaveAttribute("href", "/autorizar-solicitud/777");
  });

  it("shows only the first 10 requests on page 1 and exposes pagination", () => {
    const data = Array.from({ length: 15 }, (_, i) => makeRequest(i + 1));
    render(<AuthRequestsList data={data} role="N1" />);

    const idCellsOnPage1 = screen.getAllByText("Primera Revisión");
    expect(idCellsOnPage1).toHaveLength(10);

    const numericPageButtons = screen
      .getAllByRole("button")
      .filter((b) => /^[0-9]+$/.test(b.textContent ?? ""));
    expect(numericPageButtons.map((b) => b.textContent)).toEqual(["1", "2"]);
  });

  it("advances to the next page when the second page button is clicked", async () => {
    const data = Array.from({ length: 25 }, (_, i) => makeRequest(i + 1));
    const user = userEvent.setup();
    render(<AuthRequestsList data={data} role="N1" />);

    expect(screen.queryByText("Destino 11")).not.toBeInTheDocument();

    const pageTwo = screen.getAllByRole("button").find((b) => b.textContent === "2");
    expect(pageTwo).toBeDefined();
    await user.click(pageTwo!);

    expect(screen.getByText("Destino 11")).toBeInTheDocument();
    expect(screen.queryByText("Destino 1")).not.toBeInTheDocument();
  });

  it("supports a custom action target when type prop is provided", () => {
    render(
      <AuthRequestsList
        data={[makeRequest(888)]}
        role="Cuentas por pagar"
        type="otro-flujo"
      />,
    );
    const link = screen.getByRole("button", { name: /ver más/i }).closest("a");
    expect(link).toHaveAttribute("href", "/otro-flujo/888");
  });
});
