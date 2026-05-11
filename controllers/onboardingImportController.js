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
    const result = await previewImport(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      orgId
    );

    return res.status(200).json(result);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }
}

/**
 * POST /api/onboarding/import/apply
 *
 * Body: JSON { previewToken, roleMappings?, permissionExtras?, passwordGlobal?, passwordOverrides? }
 * permissionExtras: { [userName: string]: string[] } — códigos adicionales no cubiertos por el rol
 */
export async function postApplyImport(req, res) {
  try {
    const { previewToken, roleMappings, permissionExtras, passwordGlobal, passwordOverrides } =
      req.body ?? {};
    if (!previewToken) {
      return res.status(400).json({ error: "Se requiere el campo previewToken." });
    }

    const orgId = resolveTargetOrgId(req);
    const actingUserId = req.user?.user_id ?? req.tenant?.userId;

    const mappings =
      roleMappings && typeof roleMappings === "object" && !Array.isArray(roleMappings)
        ? roleMappings
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
      passwordOptions
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
  // tenantContextMiddleware ya resolvió el override de X-Organization-Id en req.tenant
  if (req.tenant?.organizationId) {
    return req.tenant.organizationId;
  }
  // Fallback: orgId del JWT directamente (tokens sin middleware de tenant)
  if (req.user?.organization_id) {
    return BigInt(req.user.organization_id);
  }
  throw new Error("No se pudo determinar la organización destino.");
}
