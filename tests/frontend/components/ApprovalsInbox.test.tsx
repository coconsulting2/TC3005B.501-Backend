/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Unit tests for ApprovalsInbox (M2-007). Covers the initial
 * render with the filter bar, date / monto / tipo filters,
 * the empty state when filters exclude every row, the limpiar
 * filtros action, the read-only banner for non-approver roles,
 * and the live counter that summarises how many rows match.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApprovalsInbox from "@components/ApprovalsInbox";

function makeRequest(id: number, overrides: Record<string, any> = {}) {
  return {
    request_id: id,
    request_status: "Primera Revisión",
    destination_country: "MX",
    requested_fee: 5000,
    beginning_date: "2026-04-10",
    ending_date: "2026-04-15",
    requester_name: `Usuario ${id}`,
    department_name: "Marketing",
    ...overrides,
  };
}

describe("ApprovalsInbox", () => {
  it("renders the filter bar and counts every request when no filter is active", () => {
    const data = [
      makeRequest(1, { destination_country: "MX", requested_fee: 1500 }),
      makeRequest(2, { destination_country: "US", requested_fee: 30000 }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);
    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hasta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monto mínimo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monto máximo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^tipo$/i)).toBeInTheDocument();
    expect(screen.getByText(/2 de 2 solicitudes/i)).toBeInTheDocument();
  });

  it("does not render the read-only banner for an approver role", () => {
    render(<ApprovalsInbox data={[makeRequest(1)]} role="N2" />);
    expect(screen.queryByText(/modo solo lectura/i)).not.toBeInTheDocument();
  });

  it("renders the read-only banner for a notification role", () => {
    render(<ApprovalsInbox data={[makeRequest(1)]} role="Administrador" />);
    expect(screen.getByText(/modo solo lectura/i)).toBeInTheDocument();
  });

  it("filters the list by the tipo dropdown (nacional only)", async () => {
    const user = userEvent.setup();
    const data = [
      makeRequest(1, { destination_country: "MX", requested_fee: 1500 }),
      makeRequest(2, { destination_country: "US", requested_fee: 30000 }),
      makeRequest(3, { destination_country: "MX", requested_fee: 800 }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);

    await user.selectOptions(screen.getByLabelText(/^tipo$/i), "nacional");

    expect(screen.getByText(/2 de 3 solicitudes coincide con los filtros/i)).toBeInTheDocument();
    expect(screen.queryByText("US")).not.toBeInTheDocument();
  });

  it("filters the list by the tipo dropdown (internacional only)", async () => {
    const user = userEvent.setup();
    const data = [
      makeRequest(1, { destination_country: "MX" }),
      makeRequest(2, { destination_country: "US" }),
      makeRequest(3, { destination_country: "JP" }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);

    await user.selectOptions(screen.getByLabelText(/^tipo$/i), "internacional");

    expect(screen.getByText(/2 de 3 solicitudes coincide con los filtros/i)).toBeInTheDocument();
    expect(screen.queryByText("MX")).not.toBeInTheDocument();
  });

  it("filters by the monto range", async () => {
    const user = userEvent.setup();
    const data = [
      makeRequest(1, { requested_fee: 1000 }),
      makeRequest(2, { requested_fee: 5000 }),
      makeRequest(3, { requested_fee: 25000 }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);

    await user.type(screen.getByLabelText(/monto mínimo/i), "2000");
    await user.type(screen.getByLabelText(/monto máximo/i), "10000");

    expect(screen.getByText(/1 de 3 solicitudes coincide/i)).toBeInTheDocument();
  });

  it("filters by the date range using beginning_date", async () => {
    const user = userEvent.setup();
    const data = [
      makeRequest(1, { beginning_date: "2026-03-01" }),
      makeRequest(2, { beginning_date: "2026-04-15" }),
      makeRequest(3, { beginning_date: "2026-05-20" }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);

    await user.type(screen.getByLabelText(/desde/i), "2026-04-01");
    await user.type(screen.getByLabelText(/hasta/i), "2026-04-30");

    expect(screen.getByText(/1 de 3 solicitudes coincide/i)).toBeInTheDocument();
  });

  it("shows the no-match empty state when filters exclude every row", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalsInbox
        data={[makeRequest(1, { requested_fee: 1000 })]}
        role="N1"
      />,
    );

    await user.type(screen.getByLabelText(/monto mínimo/i), "500000");

    expect(
      screen.getByText(/ninguna solicitud coincide/i),
    ).toBeInTheDocument();
  });

  it("clears every filter when the limpiar filtros button is clicked", async () => {
    const user = userEvent.setup();
    const data = [
      makeRequest(1, { destination_country: "MX" }),
      makeRequest(2, { destination_country: "US" }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);

    await user.selectOptions(screen.getByLabelText(/^tipo$/i), "nacional");
    expect(screen.getByText(/1 de 2 solicitudes coincide/i)).toBeInTheDocument();

    const limpiar = screen.getByRole("button", { name: /limpiar filtros/i });
    expect(limpiar).not.toBeDisabled();
    await user.click(limpiar);

    expect(screen.getByText(/2 de 2 solicitudes/i)).toBeInTheDocument();
    expect(screen.queryByText(/coincide con los filtros/i)).not.toBeInTheDocument();
  });

  it("disables the limpiar button when no filter is active", () => {
    render(<ApprovalsInbox data={[makeRequest(1)]} role="N1" />);
    const limpiar = screen.getByRole("button", { name: /limpiar filtros/i });
    expect(limpiar).toBeDisabled();
  });

  it("treats México and MEXICO as nacional regardless of casing", async () => {
    const user = userEvent.setup();
    const data = [
      makeRequest(1, { destination_country: "México" }),
      makeRequest(2, { destination_country: "mexico" }),
      makeRequest(3, { destination_country: "JP" }),
    ];
    render(<ApprovalsInbox data={data} role="N1" />);

    await user.selectOptions(screen.getByLabelText(/^tipo$/i), "nacional");
    expect(screen.getByText(/2 de 3 solicitudes coincide/i)).toBeInTheDocument();
  });

  it("renders the underlying inbox table when there are matching rows", () => {
    render(
      <ApprovalsInbox
        data={[makeRequest(101, { destination_country: "MX" })]}
        role="N1"
      />,
    );
    const idCell = screen.getByText("101");
    expect(idCell).toBeInTheDocument();
    const verMas = screen.getByRole("button", { name: /ver más/i });
    const link = verMas.closest("a") as HTMLAnchorElement;
    expect(link).toHaveAttribute("href", "/autorizar-solicitud/101");
    // Ensure the inbox is wrapped — we are still inside ApprovalsInbox.
    const note = screen.queryByRole("note");
    expect(note).toBeNull();
    // The screen reader summary lives inside the filter section.
    const counter = screen.getByText(/1 de 1 solicitud/i);
    expect(counter).toBeInTheDocument();
    // Just to keep `within` referenced — confirm the row carries the destination.
    const row = idCell.closest("tr") as HTMLElement;
    expect(within(row).getByText("MX")).toBeInTheDocument();
  });
});
