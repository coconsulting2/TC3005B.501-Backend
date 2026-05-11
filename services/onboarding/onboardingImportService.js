/**
 * @file services/onboarding/onboardingImportService.js
 * @description Orquestador de la importación de usuarios para onboarding.
 *
 * Dos fases:
 *   1. preview(buffer, mimetype, originalname, organizationId)
 *      Parsea + valida + cruza con BD → resumen sin persistir.
 *
 *   2. apply(previewToken, organizationId, actingUserId, roleMappings?)
 *      Persiste usu válidos. Las etiquetas de rol externas (otra empresa) se resuelven
 *      con roleMappings desde el front si no hubo equivalencia automática ni en JSON.
 *
 * JSON raíz opcional: { "roleMappings": { "Approver": "Solicitante" }, "users": [...] }
 */
import bcrypt from "bcrypt";
import prisma from "../../database/config/prisma.js";
import { resolveImportStrategy } from "./importStrategyResolver.js";
import { validateImportRows, isValidImportPassword } from "./onboardingImportValidationService.js";
import { resolveImportRole, resolveManualRoleMapping } from "./importRoleResolution.js";
import { loadEffectivePermissionsForRole } from "../permissionService.js";
import { buildPermissionsCatalogGrouped } from "./permissionCatalog.js";

const SALT_ROUNDS = 10;

const previewCache = new Map();
const PREVIEW_TTL_MS = 10 * 60 * 1000;

function generatePreviewToken() {
  return `prev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} row
 * @param {Map<string, bigint>} roleNameToId lower → roleId
 * @param {Map<bigint, string[]>} permByRoleId
 */
function buildPreviewRow(row, roleNameToId, permByRoleId) {
  const canonical = row.mappedRoleName;
  const rid = canonical ? roleNameToId.get(canonical.toLowerCase()) : undefined;
  const rolePermissionCodes =
    rid !== undefined && rid !== null ? permByRoleId.get(rid) ?? [] : [];

  return {
    userName: row.userName,
    email: row.email,
    department: row.department,
    firstName: row.firstName,
    lastName: row.lastName,
    roleName: canonical ?? undefined,
    externalRoleLabel: row.externalRoleLabel ?? undefined,
    needsRoleMapping: Boolean(row.externalRoleLabel && !row.mappedRoleName),
    /** Permisos que aporta solo el rol (referencia para UI). */
    rolePermissionCodes,
    /** @deprecated usar rolePermissionCodes — se mantiene por compatibilidad. */
    effectivePermissions: rolePermissionCodes,
  };
}

/**
 * @param {string} label
 * @param {Record<string, string>} roleMappings
 * @returns {string|null}
 */
function pickRoleMapping(label, roleMappings) {
  if (!label) return null;
  const direct = roleMappings[label];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const hit = Object.entries(roleMappings).find(
    ([k]) => k.trim().toLowerCase() === String(label).trim().toLowerCase()
  );
  return typeof hit?.[1] === "string" ? hit[1].trim() : null;
}

/**
 * @param {Record<string, unknown>} perUser
 * @param {string} globalTrim
 */
function validatePasswordApplyOptions(perUser, globalTrim) {
  if (globalTrim && !isValidImportPassword(globalTrim)) {
    throw new Error(
      "La contraseña global no cumple las reglas: mínimo 8 caracteres, una mayúscula, una minúscula y un número."
    );
  }
  for (const [uname, pwd] of Object.entries(perUser)) {
    const t = String(pwd ?? "").trim();
    if (t && !isValidImportPassword(t)) {
      throw new Error(
        `La contraseña para «${uname}» no cumple las reglas (mínimo 8 caracteres, mayúscula, minúscula y número).`
      );
    }
  }
}

/**
 * @param {object} row
 * @param {Record<string, string>} perUser
 * @param {string} globalTrim
 */
function resolvePlainPassword(row, perUser, globalTrim) {
  const specific = String(perUser[row.userName] ?? "").trim();
  if (specific) return specific;
  if (globalTrim) return globalTrim;
  return row.password;
}

/**
 * Fase 1: parsea el archivo, valida DTOs, cruza userNames/emails contra la BD.
 *
 * @returns {Promise<object>}
 */
export async function previewImport(buffer, mimetype, originalname, organizationId) {
  const orgIdBig = BigInt(organizationId);
  const strategy = resolveImportStrategy(mimetype, originalname);
  const { rows, embeddedRoleMappings } = await strategy.parse(buffer);

  const orgRoles = await prisma.role.findMany({
    where: { organizationId: orgIdBig },
    select: { roleName: true, roleId: true },
  });
  const validRoleNames = orgRoles.map((r) => r.roleName);

  const processedRows = rows.map((r) => {
    const rawRole = String(r.roleName ?? "").trim();
    const { mappedRoleName, externalRoleLabel } = resolveImportRole(
      rawRole,
      validRoleNames,
      embeddedRoleMappings
    );
    return {
      ...r,
      mappedRoleName,
      externalRoleLabel,
    };
  });

  const { valid, errors } = validateImportRows(processedRows, validRoleNames);

  const userNamesToCheck = valid.map((r) => r.userName);
  const emailsToCheck = valid.map((r) => r.email);

  const existingByUsername = await prisma.user.findMany({
    where: { userName: { in: userNamesToCheck }, organizationId: orgIdBig },
    select: { userName: true },
  });
  const existingByEmail = await prisma.user.findMany({
    where: { email: { in: emailsToCheck }, organizationId: orgIdBig },
    select: { email: true },
  });

  const conflictUserNames = new Set(existingByUsername.map((u) => u.userName));
  const conflictEmails = new Set(existingByEmail.map((u) => u.email));

  const conflicts = valid
    .filter((r) => conflictUserNames.has(r.userName) || conflictEmails.has(r.email))
    .map((r) => ({
      userName: r.userName,
      email: r.email,
      reason: conflictUserNames.has(r.userName) ? "userName ya existe" : "email ya existe",
    }));

  const conflictUserNameSet = new Set(conflicts.map((c) => c.userName));
  const applyable = valid.filter((r) => !conflictUserNameSet.has(r.userName));

  const previewToken = generatePreviewToken();
  previewCache.set(previewToken, {
    rows: applyable,
    organizationId: orgIdBig,
    orgRoles,
    validRoleNames,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  });

  for (const [token, entry] of previewCache.entries()) {
    if (entry.expiresAt < Date.now()) previewCache.delete(token);
  }

  const roleNameToId = new Map(orgRoles.map((r) => [r.roleName.toLowerCase(), r.roleId]));

  const permByRoleId = new Map();
  await Promise.all(
    orgRoles.map(async (r) => {
      const codes = await loadEffectivePermissionsForRole(r.roleId);
      permByRoleId.set(r.roleId, codes);
    })
  );

  const rolesCatalog = orgRoles.map((r) => ({
    roleName: r.roleName,
    effectivePermissions: permByRoleId.get(r.roleId) ?? [],
  }));

  const permissionsCatalog = await buildPermissionsCatalogGrouped();

  const previewSlice = applyable.slice(0, 20);
  const preview = previewSlice.map((row) => buildPreviewRow(row, roleNameToId, permByRoleId));

  const unmappedExternalRoles = [
    ...new Set(
      applyable
        .filter((r) => r.externalRoleLabel && !r.mappedRoleName)
        .map((r) => r.externalRoleLabel)
    ),
  ];

  const needsRoleMappingCount = applyable.filter(
    (r) => Boolean(r.externalRoleLabel && !r.mappedRoleName)
  ).length;

  const embeddedRoleMappingsFromFile =
    Object.keys(embeddedRoleMappings).length > 0 ? embeddedRoleMappings : undefined;

  return {
    previewToken,
    strategy: strategy.label,
    totalRows: rows.length,
    validRows: applyable.length,
    invalidRows: errors.length,
    conflictRows: conflicts.length,
    needsRoleMappingCount,
    unmappedExternalRoles,
    embeddedRoleMappingsFromFile,
    preview,
    applyableUsernames: applyable.map((r) => r.userName),
    permissionsCatalog,
    rolesCatalog,
    errors,
    conflicts,
  };
}

/**
 * Fase 2: persiste usuarios del preview en la BD.
 *
 * @param {Record<string, string>} [roleMappings] - Etiqueta externa → rol en CocoConsulting (nombre del catálogo)
 * @param {Record<string, string[]>} [permissionExtrasByUser] - userName → códigos de permiso adicionales (directos, no incluidos en el rol)
 * @param {{ globalPassword?: string, perUser?: Record<string, string> }} [passwordOptions] - sustituir contraseñas del archivo al aplicar
 */
export async function applyImport(
  previewToken,
  organizationId,
  actingUserId,
  roleMappings = {},
  permissionExtrasByUser = {},
  passwordOptions = {}
) {
  const entry = previewCache.get(previewToken);
  if (!entry) {
    throw new Error("Token de previsualización inválido o expirado. Vuelve a subir el archivo.");
  }
  if (entry.expiresAt < Date.now()) {
    previewCache.delete(previewToken);
    throw new Error("Token de previsualización expirado. Vuelve a subir el archivo.");
  }
  if (entry.organizationId !== BigInt(organizationId)) {
    throw new Error("El token no corresponde a esta organización.");
  }

  previewCache.delete(previewToken);

  const perUserPwd =
    passwordOptions.perUser &&
    typeof passwordOptions.perUser === "object" &&
    !Array.isArray(passwordOptions.perUser)
      ? passwordOptions.perUser
      : {};
  const globalPwdTrim =
    typeof passwordOptions.globalPassword === "string"
      ? passwordOptions.globalPassword.trim()
      : "";

  validatePasswordApplyOptions(perUserPwd, globalPwdTrim);

  const orgIdBig = BigInt(organizationId);
  const roleMap = new Map(entry.orgRoles.map((r) => [r.roleName.toLowerCase(), r.roleId]));
  const validRoleNames = entry.validRoleNames;

  const needsMappingRows = entry.rows.filter((r) => r.externalRoleLabel && !r.mappedRoleName);
  for (const row of needsMappingRows) {
    const picked = pickRoleMapping(row.externalRoleLabel, roleMappings);
    if (!picked || !picked.trim()) {
      throw new Error(
        `Falta asignar un rol de esta organización para la etiqueta externa "${row.externalRoleLabel}". ` +
          `Incluye roleMappings en el cuerpo (ej. { "${row.externalRoleLabel}": "Solicitante" }).`
      );
    }
  }

  const created = [];
  let skipped = 0;

  for (const row of entry.rows) {
    let canonical = row.mappedRoleName;
    if (!canonical && row.externalRoleLabel) {
      const picked = pickRoleMapping(row.externalRoleLabel, roleMappings);
      canonical = resolveManualRoleMapping(picked, validRoleNames);
      if (!canonical) {
        throw new Error(
          `El rol "${picked}" no existe en esta organización (etiqueta externa "${row.externalRoleLabel}").`
        );
      }
    }
    if (!canonical) {
      skipped++;
      continue;
    }

    const roleId = roleMap.get(canonical.toLowerCase());
    if (!roleId) {
      skipped++;
      continue;
    }

    const existing = await prisma.user.findFirst({
      where: { organizationId: orgIdBig, userName: row.userName },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const plain = resolvePlainPassword(row, perUserPwd, globalPwdTrim);
    if (!isValidImportPassword(plain)) {
      throw new Error(`Contraseña inválida para ${row.userName}.`);
    }

    const passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        organizationId: orgIdBig,
        roleId,
        userName: row.userName,
        password: passwordHash,
        email: row.email,
        workstation: row.department ?? "importado",
        active: true,
      },
      select: { userId: true, userName: true, email: true },
    });
    created.push(user);

    const extraCodes = permissionExtrasByUser[row.userName];
    if (Array.isArray(extraCodes) && extraCodes.length > 0) {
      const roleEffective = await loadEffectivePermissionsForRole(roleId);
      const roleSet = new Set(roleEffective);
      const toAdd = [...new Set(extraCodes.map(String).map((c) => c.trim()).filter(Boolean))].filter(
        (c) => !roleSet.has(c)
      );
      if (toAdd.length > 0) {
        const permRows = await prisma.permission.findMany({
          where: { code: { in: toAdd }, active: true },
          select: { permissionId: true, code: true },
        });
        const found = new Set(permRows.map((p) => p.code));
        const missing = toAdd.filter((c) => !found.has(c));
        if (missing.length > 0) {
          throw new Error(
            `Permisos no válidos o inactivos para ${row.userName}: ${missing.join(", ")}`
          );
        }
        await prisma.userPermission.createMany({
          data: permRows.map((p) => ({
            userId: user.userId,
            permissionId: p.permissionId,
            organizationId: orgIdBig,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  return {
    created: created.length,
    skipped,
    createdUsers: created,
    appliedBy: actingUserId,
  };
}
