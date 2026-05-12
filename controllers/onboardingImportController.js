/**
 * @file controllers/onboardingImportController.js
 * @description Endpoints de importación masiva de usuarios para onboarding.
 *
 * POST /api/onboarding/import/preview  — parsea y valida el archivo, devuelve previewToken.
 * POST /api/onboarding/import/apply    — persiste los usuarios del preview.
 */
import {
  previewImport,
  applyImport,
} from "../services/onboarding/onboardingImportService.js";

/**
 * POST /api/onboarding/import/preview
 *
 * Body: multipart/form-data
 *   file: <archivo JSON o CSV>
 *
 * Query params opcionales:
 *   create_new_org=1 — vista previa para importar creando una org CLIENT nueva desde el bloque
 *     `organization` del JSON (solo ROOT + permiso organization:create). El token queda ligado
 *     a la org del JWT (Ditta), no a la org impersonada.
 */
export async function postPreviewImport(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Se requiere un archivo (field: file)." });
    }

    const rawFlag = req.query?.create_new_org ?? req.query?.createNewOrg;
    const createNewOrganization =
      rawFlag === "1" || String(rawFlag ?? "").toLowerCase() === "true";
    const actorHasOrganizationCreate = Boolean(
      req.user?.permissionSet?.has("organization:create")
    );

    const orgId = resolveTargetOrgIdForOnboardingImport(req, { createNewOrganization });
    const actingUserId = resolveActingUserId(req);
    const result = await previewImport(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      orgId,
      actingUserId,
      { createNewOrganization, actorHasOrganizationCreate }
    );

    return res.status(200).json(result);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }
}

/**
 * POST /api/onboarding/import/apply
 *
 * Body: JSON {
 *   previewToken,
 *   roleMappings?,        // etiqueta externa → rol de la org
 *   roleOverrides?,       // userName → rol de la org (sobrescribe el del archivo)
 *   permissionExtras?,    // userName → códigos de permiso adicionales (UserPermission)
 *   passwordGlobal?,
 *   passwordOverrides?,    // userName → password individual
 *   createNewOrganization?: boolean  // debe coincidir con la vista previa; crea org CLIENT + usuarios
 * }
 */
export async function postApplyImport(req, res) {
  try {
    const {
      previewToken,
      roleMappings,
      roleOverrides,
      permissionExtras,
      passwordGlobal,
      passwordOverrides,
      createNewOrganization: createNewOrganizationRaw,
    } = req.body ?? {};
    if (!previewToken) {
      return res.status(400).json({ error: "Se requiere el campo previewToken." });
    }

    const createNewOrganization = Boolean(createNewOrganizationRaw);
    if (createNewOrganization && !req.user?.permissionSet?.has("organization:create")) {
      return res.status(403).json({ error: "No tienes permiso para crear una organización nueva." });
    }

    const orgId = resolveTargetOrgIdForOnboardingImport(req, { createNewOrganization });
    const actingUserId = resolveActingUserId(req);

    const mappings =
      roleMappings && typeof roleMappings === "object" && !Array.isArray(roleMappings)
        ? roleMappings
        : {};

    const overrides =
      roleOverrides && typeof roleOverrides === "object" && !Array.isArray(roleOverrides)
        ? roleOverrides
        : {};

    const extras =
      permissionExtras && typeof permissionExtras === "object" && !Array.isArray(permissionExtras)
        ? permissionExtras
        : {};

    const passwordOptions = {};
    if (typeof passwordGlobal === "string" && passwordGlobal.trim()) {
      passwordOptions.globalPassword = passwordGlobal.trim();
    }
    if (
      passwordOverrides &&
      typeof passwordOverrides === "object" &&
      !Array.isArray(passwordOverrides)
    ) {
      passwordOptions.perUser = passwordOverrides;
    }

    const result = await applyImport(
      previewToken,
      orgId,
      actingUserId,
      mappings,
      extras,
      passwordOptions,
      overrides,
      { createNewOrganization }
    );

    return res.status(201).json(result);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }
}

/**
 * Determina el organizationId destino del import.
 * Si `createNewOrganization`, el token debe ligarse a la org del JWT (ROOT), no a la impersonada.
 *
 * @param {import('express').Request} req
 * @param {{ createNewOrganization?: boolean }} [opts]
 * @returns {bigint}
 */
function resolveTargetOrgIdForOnboardingImport(req, opts = {}) {
  const createNewOrganization = Boolean(opts.createNewOrganization);
  if (!req.tenant?.organizationId) {
    if (req.user?.organization_id) {
      return BigInt(req.user.organization_id);
    }
    throw new Error("No se pudo determinar la organización destino.");
  }
  if (createNewOrganization && req.tenant.isRoot && req.tenant.jwtOrgId !== undefined && req.tenant.jwtOrgId !== null) {
    return req.tenant.jwtOrgId;
  }
  return req.tenant.organizationId;
}

/**
 * @param {import('express').Request} req
 * @returns {bigint}
 */
function resolveActingUserId(req) {
  const raw = req.user?.user_id ?? req.tenant?.userId;
  if (raw === undefined || raw === null || raw === "") {
    throw new Error("No se pudo determinar el usuario que realiza la importación.");
  }
  return BigInt(raw);
}
