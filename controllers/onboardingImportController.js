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
 * Query param opcional:
 *   orgId: ID de la org destino. Si no se manda, usa la org del JWT (req.tenant.organizationId).
 *          Solo DittaSuperAdmin puede especificar orgId diferente al suyo.
 */
export async function postPreviewImport(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Se requiere un archivo (field: file)." });
    }

    const orgId = resolveTargetOrgId(req);
    const actingUserId = resolveActingUserId(req);
    const result = await previewImport(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      orgId,
      actingUserId
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
 *   passwordOverrides?    // userName → password individual
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
    } = req.body ?? {};
    if (!previewToken) {
      return res.status(400).json({ error: "Se requiere el campo previewToken." });
    }

    const orgId = resolveTargetOrgId(req);
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
      overrides
    );

    return res.status(201).json(result);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }
}

/**
 * Determina el organizationId destino.
 * DittaSuperAdmin puede pasar ?orgId=X o header X-Organization-Id.
 * El resto usa su propio org del contexto de tenant.
 *
 * @param {import('express').Request} req
 * @returns {bigint}
 */
function resolveTargetOrgId(req) {
  if (req.tenant?.organizationId) {
    return req.tenant.organizationId;
  }
  if (req.user?.organization_id) {
    return BigInt(req.user.organization_id);
  }
  throw new Error("No se pudo determinar la organización destino.");
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
