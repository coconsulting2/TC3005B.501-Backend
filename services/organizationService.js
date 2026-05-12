/**
 * @module organizationService
 * @description Gestión de organizaciones (tenants). Solo Ditta puede crear/listar todas.
 * Cada org cliente solo ve la propia.
 *
 * Endpoints expuestos vía controllers/organizationController.js:
 *   POST   /api/organizations            organization:create
 *   GET    /api/organizations            organization:list_all
 *   GET    /api/organizations/me         autenticado
 *   GET    /api/organizations/:id        organization:read
 *   PATCH  /api/organizations/:id        organization:update
 *   POST   /api/organizations/:id/activate   organization:activate
 *   POST   /api/organizations/:id/suspend    organization:suspend
 */
import prisma from "../database/config/prisma.js";
import { withRls } from "../database/config/rlsConnection.js";
import { bootstrapOrganizationCatalogs, ensureOrganizationAdmin } from "../prisma/seedHelpers/bootstrapOrganization.js";

/**
 * Crea una nueva organización CLIENT con su admin inicial. Solo super-admin Ditta.
 *
 * @param {{ nombre: string, rfc?: string|null, razonSocial?: string|null, timezone?: string, baseCurrency?: string, adminEmail: string, adminNombre: string, adminPassword: string }} input
 * @returns {Promise<{ organization: object, adminUser: object }>}
 */
export async function createOrganization(input) {
  const {
    nombre,
    rfc = null,
    razonSocial = null,
    timezone = "America/Mexico_City",
    baseCurrency = "MXN",
    adminEmail,
    adminNombre,
    adminPassword,
  } = input;

  if (!nombre?.trim()) {
    const err = new Error("El nombre de la organización es obligatorio");
    err.status = 400;
    throw err;
  }
  if (!adminEmail?.trim() || !adminPassword?.trim()) {
    const err = new Error("Se requiere email y contraseña del admin inicial");
    err.status = 400;
    throw err;
  }
  if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) {
    const err = new Error("RFC inválido (formato SAT)");
    err.status = 400;
    throw err;
  }

  // Crear org + bootstrap catalogs + admin user dentro de bypass cross-tenant
  // (el caller es Ditta y necesita escribir en una org que aún no existe).
  return withRls(1n, { bypass: true }, async () => {
    const org = await prisma.organization.create({
      data: {
        nombre,
        rfc: rfc ?? null,
        razonSocial: razonSocial ?? null,
        timezone,
        baseCurrency,
        kind: "CLIENT",
        status: "CONFIGURING",
      },
    });

    await bootstrapOrganizationCatalogs(prisma, org.id, { includeDittaSuperAdmin: false });

    const userName = adminEmail.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 60);
    await ensureOrganizationAdmin(prisma, org.id, {
      userName,
      email: adminEmail,
      password: adminPassword,
      roleName: "Administrador",
    });

    return { organization: serializeOrganization(org) };
  });
}

/**
 * Crea una org CLIENT en CONFIGURING + catálogos bootstrap, sin usuario admin inicial.
 * Los usuarios se cargan después (p. ej. import JSON). Solo bypass cross-tenant (Ditta).
 *
 * @param {{ nombre: string, rfc?: string|null, razonSocial?: string|null, timezone?: string, baseCurrency?: string }} input
 * @returns {Promise<{ organization: ReturnType<typeof serializeOrganization> }>}
 */
export async function createClientOrganizationOnly(input) {
  const {
    nombre,
    rfc = null,
    razonSocial = null,
    timezone = "America/Mexico_City",
    baseCurrency = "MXN",
  } = input;

  if (!nombre?.trim()) {
    const err = new Error("El nombre de la organización es obligatorio");
    err.status = 400;
    throw err;
  }
  if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) {
    const err = new Error("RFC inválido (formato SAT)");
    err.status = 400;
    throw err;
  }

  return withRls(1n, { bypass: true }, async () => {
    const org = await prisma.organization.create({
      data: {
        nombre: nombre.trim(),
        rfc: rfc ?? null,
        razonSocial: razonSocial ?? null,
        timezone,
        baseCurrency,
        kind: "CLIENT",
        status: "CONFIGURING",
      },
    });

    await bootstrapOrganizationCatalogs(prisma, org.id, { includeDittaSuperAdmin: false });

    return { organization: serializeOrganization(org) };
  });
}

/**
 * Lista todas las orgs (solo Ditta). Permite filtros por kind, status.
 *
 * @param {{ kind?: 'ROOT'|'CLIENT', status?: 'CONFIGURING'|'ACTIVE'|'SUSPENDED', page?: number, pageSize?: number }} opts
 */
export async function listOrganizations(opts = {}) {
  const { kind, status, page = 1, pageSize = 25 } = opts;
  const where = {};
  if (kind) where.kind = kind;
  if (status) where.status = status;

  return withRls(1n, { bypass: true }, async () => {
    const [rows, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy: [{ kind: "asc" }, { nombre: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.organization.count({ where }),
    ]);
    return {
      data: rows.map(serializeOrganization),
      total,
      page,
      pageSize,
    };
  });
}

export async function getOrganization(id, { bypass = false } = {}) {
  const organizationId = BigInt(id);
  return withRls(organizationId, { bypass }, async () => {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    return org ? serializeOrganization(org) : null;
  });
}

export async function getOrganizationMe(organizationId) {
  return getOrganization(organizationId, { bypass: false });
}

export async function updateOrganization(id, patch, { bypass = false } = {}) {
  const organizationId = BigInt(id);
  const allowed = ["nombre", "logoUrl", "timezone", "baseCurrency", "razonSocial", "rfc"];
  const data = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (Object.keys(data).length === 0) {
    const err = new Error("Nada que actualizar");
    err.status = 400;
    throw err;
  }
  return withRls(organizationId, { bypass }, async () => {
    const updated = await prisma.organization.update({ where: { id: organizationId }, data });
    return serializeOrganization(updated);
  });
}

export async function activateOrganization(id) {
  const organizationId = BigInt(id);
  return withRls(1n, { bypass: true }, async () => {
    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "ACTIVE" },
    });
    return serializeOrganization(updated);
  });
}

export async function suspendOrganization(id) {
  const organizationId = BigInt(id);
  if (organizationId === 1n) {
    const err = new Error("La organización ROOT no puede ser suspendida");
    err.status = 400;
    throw err;
  }
  return withRls(1n, { bypass: true }, async () => {
    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: { status: "SUSPENDED" },
    });
    return serializeOrganization(updated);
  });
}

function serializeOrganization(o) {
  return {
    id: typeof o.id === "bigint" ? o.id.toString() : String(o.id),
    nombre: o.nombre,
    razonSocial: o.razonSocial,
    rfc: o.rfc,
    logoUrl: o.logoUrl,
    timezone: o.timezone,
    baseCurrency: o.baseCurrency,
    kind: o.kind,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
