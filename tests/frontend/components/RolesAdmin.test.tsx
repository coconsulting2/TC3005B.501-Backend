/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Unit tests for RolesAdmin. Covers the initial render with seed data,
 * opening the create dialog and validating the name field, creating a
 * new role through the form, opening the edit dialog with the role
 * pre-loaded, the delete-with-warning flow for a role with active
 * users, the guard that prevents deleting the last admin role, and
 * the API integration that swaps the seed list with data from the
 * backend when apiEndpoint is provided.
 */

import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import RolesAdmin from "@components/RolesAdmin";
import { server } from "../mocks/server";
import type { Role } from "@type/Role";

const API = "https://localhost:3000/api";

const fixedRoles: Role[] = [
  {
    role_id: 1,
    name: "Administrador",
    permissions: ["admin.roles.gestionar"],
    max_authorization_amount: null,
    expiration_date: null,
    is_admin: true,
    active_users_count: 3,
  },
  {
    role_id: 2,
    name: "Solicitante",
    permissions: ["viajes.solicitud.crear"],
    max_authorization_amount: 0,
    expiration_date: null,
    is_admin: false,
    active_users_count: 5,
  },
];

const twoAdminRoles: Role[] = [
  { ...fixedRoles[0] },
  {
    role_id: 3,
    name: "Admin secundario",
    permissions: ["admin.roles.gestionar"],
    max_authorization_amount: null,
    expiration_date: null,
    is_admin: true,
    active_users_count: 1,
  },
];

describe("RolesAdmin", () => {
  it("renders the seed roles in the table with admin pill and counts", () => {
    render(<RolesAdmin initialData={fixedRoles} />);
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("Solicitante")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(
      screen.getByText(/2 roles registrados/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 administrador/i)).toBeInTheDocument();
  });

  it("opens the create dialog and shows the empty form", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);
    await user.click(screen.getByRole("button", { name: /\+ nuevo rol/i }));
    expect(
      await screen.findByRole("heading", { name: /nuevo rol/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ej: autorizador regional/i)).toHaveValue("");
  });

  it("blocks submission with a name shorter than 2 characters", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);
    await user.click(screen.getByRole("button", { name: /\+ nuevo rol/i }));

    const nameInput = await screen.findByPlaceholderText(/ej: autorizador regional/i);
    await user.type(nameInput, "x");
    await user.click(screen.getByRole("button", { name: /crear rol/i }));

    expect(
      await screen.findByText(/al menos 2 caracteres/i),
    ).toBeInTheDocument();
  });

  it("creates a role and shows the success toast and a new table row", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);
    await user.click(screen.getByRole("button", { name: /\+ nuevo rol/i }));

    await user.type(
      await screen.findByPlaceholderText(/ej: autorizador regional/i),
      "Auditor regional",
    );
    await user.click(screen.getByRole("button", { name: /crear rol/i }));

    expect(
      await screen.findByText(/rol creado correctamente/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("Auditor regional")).toBeInTheDocument();
    expect(screen.getByText(/3 roles registrados/i)).toBeInTheDocument();
  });

  it("opens the edit dialog pre-loaded with the role's data", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);

    const solicitanteRow = screen.getByText("Solicitante").closest("tr") as HTMLElement;
    await user.click(within(solicitanteRow).getByRole("button", { name: /editar/i }));

    expect(
      await screen.findByRole("heading", { name: /editar rol: solicitante/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ej: autorizador regional/i)).toHaveValue("Solicitante");
  });

  it("warns before deleting a role with active users and removes it on confirm", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);

    const solicitanteRow = screen.getByText("Solicitante").closest("tr") as HTMLElement;
    await user.click(within(solicitanteRow).getByRole("button", { name: /eliminar/i }));

    expect(
      await screen.findByRole("heading", { name: /eliminar rol/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/5 usuarios activos/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/quedarán sin rol asignado/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /eliminar de todos modos/i }),
    );

    expect(
      await screen.findByText(/rol "solicitante" eliminado/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Solicitante")).not.toBeInTheDocument();
  });

  it("blocks deletion of the last admin role and disables the confirm button", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);

    const adminRow = screen.getByText("Administrador").closest("tr") as HTMLElement;
    await user.click(within(adminRow).getByRole("button", { name: /eliminar/i }));

    expect(
      await screen.findByText(/último rol administrador/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /eliminar de todos modos/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar/i })).toBeInTheDocument();
  });

  it("allows deleting one admin role when more than one admin exists", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={twoAdminRoles} />);

    const secondaryRow = screen
      .getByText("Admin secundario")
      .closest("tr") as HTMLElement;
    await user.click(within(secondaryRow).getByRole("button", { name: /eliminar/i }));

    expect(
      await screen.findByRole("button", { name: /eliminar de todos modos/i }),
    ).toBeInTheDocument();
  });

  it("loads roles from the API endpoint when one is provided", async () => {
    server.use(
      http.get(`${API}/admin/roles`, () =>
        HttpResponse.json([
          {
            role_id: 99,
            name: "Rol remoto",
            permissions: ["reportes.ver"],
            max_authorization_amount: 1000,
            expiration_date: null,
            is_admin: false,
            active_users_count: 7,
          },
        ]),
      ),
    );
    render(<RolesAdmin apiEndpoint="/admin/roles" token="t" />);
    expect(await screen.findByText("Rol remoto")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/1 rol registrado/i)).toBeInTheDocument();
    });
  });

  it("falls back to the seed list when the API endpoint fails", async () => {
    server.use(
      http.get(`${API}/admin/roles`, () =>
        HttpResponse.json({ error: "x" }, { status: 500 }),
      ),
    );
    render(<RolesAdmin apiEndpoint="/admin/roles" />);
    expect(await screen.findByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("Solicitante")).toBeInTheDocument();
  });

  it("toggles a single permission on the create form", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);
    await user.click(screen.getByRole("button", { name: /\+ nuevo rol/i }));

    const reportesCheckbox = await screen.findByRole("checkbox", {
      name: /ver reportes/i,
    });
    expect(reportesCheckbox).not.toBeChecked();
    await user.click(reportesCheckbox);
    expect(reportesCheckbox).toBeChecked();

    expect(screen.getByText(/^\(1\/\d+\)$/)).toBeInTheDocument();
  });

  it("selects every permission in a module with the toggle module button", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);
    await user.click(screen.getByRole("button", { name: /\+ nuevo rol/i }));

    await screen.findByPlaceholderText(/ej: autorizador regional/i);
    const reportesHeader = screen.getByText("Reportes");
    const reportesModule = reportesHeader.closest("div.p-3") as HTMLElement;
    const toggleAll = within(reportesModule).getByRole("button", {
      name: /seleccionar todos/i,
    });
    await user.click(toggleAll);

    const reportesCheckbox = screen.getByRole("checkbox", { name: /ver reportes/i });
    const exportarCheckbox = screen.getByRole("checkbox", {
      name: /exportar reportes/i,
    });
    expect(reportesCheckbox).toBeChecked();
    expect(exportarCheckbox).toBeChecked();
  });

  it("updates a role through the edit dialog and shows the actualizado toast", async () => {
    const user = userEvent.setup();
    render(<RolesAdmin initialData={fixedRoles} />);

    const solicitanteRow = screen.getByText("Solicitante").closest("tr") as HTMLElement;
    await user.click(within(solicitanteRow).getByRole("button", { name: /editar/i }));

    const nameInput = await screen.findByPlaceholderText(/ej: autorizador regional/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Solicitante avanzado");
    await user.click(screen.getByRole("button", { name: /actualizar/i }));

    expect(await screen.findByText(/rol actualizado/i)).toBeInTheDocument();
    expect(screen.getByText("Solicitante avanzado")).toBeInTheDocument();
  });
});
