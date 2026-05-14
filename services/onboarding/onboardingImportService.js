/**
 * @file services/onboarding/onboardingImportService.js
 * @description Orquestador de la importación de usuarios para onboarding.
 *
 * Dos fases:
 *   1. preview(buffer, mimetype, originalname, organizationId, actingUserId)
 *      Parsea + valida + cruza con BD → resumen sin persistir.
 *
 *   2. apply(previewToken, organizationId, actingUserId, roleMappings?, permissionExtras?, passwordOptions?)
 *      Persiste usuarios válidos. Las etiquetas de rol externas (otra empresa) se resuelven
 *      con roleMappings desde el front si no hubo equivalencia automática ni en JSON.
 *
 * JSON raíz opcional: { "roleMappings": { "Approver": "Solicitante" }, "users": [...] }
 *
 * Seguridad:
 *   - El previewToken se genera con crypto.randomBytes y queda atado a (organizationId, actingUserId).
 *   - El cache NUNCA guarda contraseñas en claro (las del archivo, si vinieran, se descartan).
 *     En `apply` deben suministrarse vía passwordGlobal o passwordOverrides[userName].
 *   - Las colisiones de userName/email se evalúan globalmente (no por org) porque el
 *     esquema tiene constraint UNIQUE global; además se traduce P2002 en mensajes claros.
 */
import crypto from "crypto";
import bcrypt from "bcrypt";
import prisma from "../../database/config/prisma.js";
import { resolveImportStrategy } from "./importStrategyResolver.js";
import { validateImportRows, isValidImportPassword } from "./onboardingImportValidationService.js";
import { resolveImportRole, resolveManualRoleMapping } from "./importRoleResolution.js";
import { loadEffectivePermissionsForRole } from "../permissionService.js";
import { buildPermissionsCatalogGrouped } from "./permissionCatalog.js";
import { getDefaultClientRoleNamesForOnboardingImport } from "../../prisma/seedHelpers/bootstrapOrganization.js";
import { createClientOrganizationOnly } from "../organizationService.js";

const SALT_ROUNDS = 10;

const previewCache = new Map();
const PREVIEW_TTL_MS = 10 * 60 * 1000;

/** 32 bytes hex = 64 chars; no predecible. */
function generatePreviewToken() {
  return `prev_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * @param {bigint|number|string} a
 * @param {bigint|number|string} b
 */
function sameBigInt(a, b) {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
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
    /** UI: avisa al admin que el archivo traía contraseñas (que ya descartamos). */
    hasFilePassword: Boolean(row.hasFilePassword),
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
 * Determina la contraseña final del usuario en `apply`. Por seguridad, las
 * contraseñas del archivo NO se utilizan: deben llegar por opciones explícitas.
 *
 * @param {string} userName
 * @param {Record<string, string>} perUser
 * @param {string} globalTrim
 * @returns {string|null} contraseña en claro o null si no hay
 */
function resolvePlainPassword(userName, perUser, globalTrim) {
  const specific = String(perUser[userName] ?? "").trim();
  if (specific) return specific;
  if (globalTrim) return globalTrim;
  return null;
}

/**
 *
 * @param row
 */
function buildEmpleadoNombre(row) {
  const fn = String(row.firstName ?? "").trim();
  const ln = String(row.lastName ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(row.userName ?? "").trim();
}

/**
 *
 * @param userId
 */
function fallbackProveedorFromUserId(userId) {
  const base = 20000000000n + BigInt(Number(userId));
  return base.toString().padStart(11, "0").slice(-11);
}

/**
 * @param {{ nombre: string, rfc?: string|null }} spec
 */
function validateImportOrganizationSpec(spec) {
  if (spec.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(spec.rfc)) {
    throw new Error("El RFC del bloque \"organization\" del JSON no cumple el formato SAT.");
  }
}

/**
 * Fase 1: parsea el archivo, valida DTOs, cruza userNames/emails contra la BD.
 *
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} originalname
 * @param {bigint|number|string} organizationId
 * @param {bigint|number|string} actingUserId
 * @param {{ createNewOrganization?: boolean, actorHasOrganizationCreate?: boolean }} [options]
 * @returns {Promise<object>}
 */
export async function previewImport(
  buffer,
  mimetype,
  originalname,
  organizationId,
  actingUserId,
  options = {}
) {
  const createNewOrganization = Boolean(options.createNewOrganization);
  const actorHasOrganizationCreate = Boolean(options.actorHasOrganizationCreate);

  const orgIdBig = BigInt(organizationId);
  if (actingUserId === undefined || actingUserId === null) {
    throw new Error("Falta actingUserId para emitir el token de previsualización.");
  }
  const actingUserIdBig = BigInt(actingUserId);

  const strategy = resolveImportStrategy(mimetype, originalname);
  const parsed = await strategy.parse(buffer);
  const rows = parsed.rows;
  const embeddedRoleMappings = parsed.embeddedRoleMappings ?? {};
  const organizationSpec = parsed.organizationSpec ?? null;

  /** @type {{ roleName: string, roleId: number }[]} */
  let orgRoles;
  /** @type {string[]} */
  let validRoleNames;

  if (createNewOrganization) {
    if (strategy.label !== "JSON") {
      throw new Error("La creación de una organización nueva solo está disponible con archivos JSON.");
    }
    if (!actorHasOrganizationCreate) {
      throw new Error("No tienes permiso para crear una organización nueva (organization:create).");
    }
    if (!organizationSpec?.nombre?.trim()) {
      throw new Error(
        "Para crear una organización nueva, el JSON debe incluir un objeto \"organization\" con al menos \"nombre\"."
      );
    }
    validateImportOrganizationSpec(organizationSpec);
    validRoleNames = getDefaultClientRoleNamesForOnboardingImport();
    orgRoles = validRoleNames.map((roleName, i) => ({ roleName, roleId: -(i + 1) }));
  } else {
    orgRoles = await prisma.role.findMany({
      where: { organizationId: orgIdBig },
      select: { roleName: true, roleId: true },
    });
    validRoleNames = orgRoles.map((r) => r.roleName);
  }

  const processedRows = rows.map((r) => {
    const rawRole = String(r.roleName ?? "").trim();
    const { mappedRoleName, externalRoleLabel } = resolveImportRole(
      rawRole,
      validRoleNames,
      embeddedRoleMappings
    );
    return {
      ...r,
      hasFilePassword: Boolean(String(r.password ?? "").trim()),
      mappedRoleName,
      externalRoleLabel,
    };
  });

  const { valid, errors } = validateImportRows(processedRows, validRoleNames);

  const userNamesToCheck = valid.map((r) => r.userName);
  const emailsToCheck = valid.map((r) => r.email);

  // Las constraints UNIQUE de userName/email en Prisma son globales: si validamos por org,
  // dejamos pasar duplicados que después harán fallar el apply con P2002.
  const existingByUsername = await prisma.user.findMany({
    where: { userName: { in: userNamesToCheck } },
    select: { userName: true },
  });
  const existingByEmail = await prisma.user.findMany({
    where: { email: { in: emailsToCheck } },
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
  const applyable = valid
    .filter((r) => !conflictUserNameSet.has(r.userName))
    // Importante: NO conservar contraseñas del archivo en memoria.
    .map(({ password: _ignored, ...rest }) => rest);

  const previewToken = generatePreviewToken();
  previewCache.set(previewToken, {
    rows: applyable,
    organizationId: orgIdBig,
    actingUserId: actingUserIdBig,
    orgRoles,
    validRoleNames,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
    createNewOrganization,
    newOrgSpec: createNewOrganization ? organizationSpec : undefined,
  });

  // GC oportunista de tokens vencidos.
  for (const [token, entry] of previewCache.entries()) {
    if (entry.expiresAt < Date.now()) previewCache.delete(token);
  }

  const roleNameToId = new Map(orgRoles.map((r) => [r.roleName.toLowerCase(), r.roleId]));

  const permByRoleId = new Map();
  await Promise.all(
    orgRoles.map(async (r) => {
      if (r.roleId < 0) {
        permByRoleId.set(r.roleId, []);
        return;
      }
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

  const fileHadAnyPassword = processedRows.some((r) => r.hasFilePassword);

  const organizationFromFile =
    organizationSpec && strategy.label === "JSON"
      ? {
          nombre: organizationSpec.nombre,
          rfc: organizationSpec.rfc,
          razonSocial: organizationSpec.razonSocial,
          timezone: organizationSpec.timezone,
          baseCurrency: organizationSpec.baseCurrency,
        }
      : undefined;

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
    /**
     * Indica al front que el archivo traía contraseñas. Por seguridad, esas
     * contraseñas se descartaron y será obligatorio definir global o por usuario
     * en `apply`.
     */
    fileHadPasswords: fileHadAnyPassword,
    preview,
    applyableUsernames: applyable.map((r) => r.userName),
    permissionsCatalog,
    rolesCatalog,
    errors,
    conflicts,
    organizationFromFile,
    newOrganizationApplyAvailable:
      strategy.label === "JSON" &&
      Boolean(organizationSpec?.nombre?.trim()) &&
      actorHasOrganizationCreate,
    previewCreateNewOrganization: createNewOrganization,
  };
}

/**
 * Fase 2: persiste usuarios del preview en la BD.
 *
 * @param {string} previewToken
 * @param {bigint|number|string} organizationId
 * @param {bigint|number|string} actingUserId
 * @param {Record<string, string>} [roleMappings] - Etiqueta externa → rol en CocoConsulting (nombre del catálogo)
 * @param {Record<string, string[]>} [permissionExtrasByUser] - userName → códigos de permiso adicionales (directos, no incluidos en el rol)
 * @param {{ globalPassword?: string, perUser?: Record<string, string> }} [passwordOptions] - contraseñas (obligatorias por archivo o global)
 * @param {Record<string, string>} [roleOverridesByUser] - userName → rol elegido en UI; tiene PRIORIDAD sobre mappedRoleName y sobre roleMappings
 * @param {{ createNewOrganization?: boolean }} [applyOptions]
 */
export async function applyImport(
  previewToken,
  organizationId,
  actingUserId,
  roleMappings = {},
  permissionExtrasByUser = {},
  passwordOptions = {},
  roleOverridesByUser = {},
  applyOptions = {}
) {
  const entry = previewCache.get(previewToken);
  if (!entry) {
    throw new Error("Token de previsualización inválido o expirado. Vuelve a subir el archivo.");
  }
  if (entry.expiresAt < Date.now()) {
    previewCache.delete(previewToken);
    throw new Error("Token de previsualización expirado. Vuelve a subir el archivo.");
  }
  if (!sameBigInt(entry.organizationId, organizationId)) {
    throw new Error("El token no corresponde a esta organización.");
  }
  if (actingUserId === undefined || actingUserId === null || !sameBigInt(entry.actingUserId, actingUserId)) {
    throw new Error("El token fue emitido para otro usuario; vuelve a subir el archivo.");
  }

  const applyCreateNew = Boolean(applyOptions?.createNewOrganization);
  if (applyCreateNew !== Boolean(entry.createNewOrganization)) {
    throw new Error(
      "La opción «crear organización nueva» no coincide con la vista previa. Vuelve a generar la vista previa."
    );
  }

  // Consumir el token solo después de validar el contexto.
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

  let orgIdBig = BigInt(organizationId);
  /** @type {Map<string, number>} */
  let roleMap;
  /** @type {string[]} */
  let validRoleNames = entry.validRoleNames;

  if (entry.createNewOrganization) {
    if (!entry.newOrgSpec) {
      throw new Error("Vista previa incompleta: falta la definición de la organización nueva.");
    }
    const { organization } = await createClientOrganizationOnly(entry.newOrgSpec);
    orgIdBig = BigInt(organization.id);
    const orgRolesFresh = await prisma.role.findMany({
      where: { organizationId: orgIdBig },
      select: { roleName: true, roleId: true },
    });
    roleMap = new Map(orgRolesFresh.map((r) => [r.roleName.toLowerCase(), r.roleId]));
    validRoleNames = orgRolesFresh.map((r) => r.roleName);
  } else {
    roleMap = new Map(entry.orgRoles.map((r) => [r.roleName.toLowerCase(), r.roleId]));
  }

  const overridesByUser =
    roleOverridesByUser &&
    typeof roleOverridesByUser === "object" &&
    !Array.isArray(roleOverridesByUser)
      ? roleOverridesByUser
      : {};

  // Validamos que todos los overrides apunten a roles existentes en la org.
  for (const [uname, overrideName] of Object.entries(overridesByUser)) {
    const candidate = String(overrideName ?? "").trim();
    if (!candidate) continue;
    const canonical = resolveManualRoleMapping(candidate, validRoleNames);
    if (!canonical) {
      throw new Error(
        `El rol "${candidate}" para «${uname}» no existe en esta organización.`
      );
    }
  }

  // Solo exigimos mapping de etiquetas externas para usuarios que NO tengan override.
  const needsMappingRows = entry.rows.filter(
    (r) =>
      r.externalRoleLabel &&
      !r.mappedRoleName &&
      !String(overridesByUser[r.userName] ?? "").trim()
  );
  for (const row of needsMappingRows) {
    const picked = pickRoleMapping(row.externalRoleLabel, roleMappings);
    if (!picked || !picked.trim()) {
      throw new Error(
        `Falta asignar un rol de esta organización para la etiqueta externa "${row.externalRoleLabel}". ` +
          `Incluye roleMappings en el cuerpo (ej. { "${row.externalRoleLabel}": "Solicitante" }) ` +
          `o un rol por usuario en roleOverrides.`
      );
    }
  }

  const created = [];
  const managerLinks = [];
  let skipped = 0;
  /** @type {Array<{ userName: string, reason: string }>} */
  const failures = [];

  for (const row of entry.rows) {
    /**
     * Prioridad para el rol final:
     *   1. roleOverridesByUser[userName]  — elección explícita del admin en la UI.
     *   2. row.mappedRoleName             — resuelto en el preview (archivo/aliases).
     *   3. roleMappings[externalLabel]    — mapping manual de etiquetas externas.
     */
    let canonical = null;
    const overrideRaw = String(overridesByUser[row.userName] ?? "").trim();
    if (overrideRaw) {
      canonical = resolveManualRoleMapping(overrideRaw, validRoleNames);
    }
    if (!canonical) canonical = row.mappedRoleName ?? null;
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

    const plain = resolvePlainPassword(row.userName, perUserPwd, globalPwdTrim);
    if (!plain) {
      throw new Error(
        `No hay contraseña para «${row.userName}». Define una contraseña global o por usuario.`
      );
    }
    if (!isValidImportPassword(plain)) {
      throw new Error(`Contraseña inválida para ${row.userName}.`);
    }

    const passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);

    let user;
    try {
      user = await prisma.user.create({
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
    } catch (e) {
      if (e?.code === "P2002") {
        const target = Array.isArray(e.meta?.target)
          ? e.meta.target.join(",").toLowerCase()
          : String(e.meta?.target ?? "").toLowerCase();
        const field = target.includes("email") ? "email" : "userName";
        failures.push({
          userName: row.userName,
          reason: `${field} ya existe (otro usuario lo tomó después del preview).`,
        });
        skipped++;
        continue;
      }
      throw e;
    }

    // Si el archivo trae no_empleado (layout SAP), sincronizamos catálogo Empleado
    // y vinculamos el User recién creado.
    if (row.noEmpleado) {
      const noEmpleado = String(row.noEmpleado).slice(0, 10);
      const proveedor = String(row.sapProveedor || fallbackProveedorFromUserId(user.userId)).slice(0, 11);
      const ceco = String(row.sapCeco || row.department || "000").slice(0, 10);
      const status = String(row.sapStatus || "A").toUpperCase() === "I" ? "I" : "A";
      const nombre = buildEmpleadoNombre(row).slice(0, 100);
      const actor = `import_${String(actingUserId)}`.slice(0, 30);

      await prisma.empleado.upsert({
        where: {
          organizationId_noEmpleado: {
            organizationId: orgIdBig,
            noEmpleado,
          },
        },
        create: {
          organizationId: orgIdBig,
          noEmpleado,
          nombre,
          email: row.email ? String(row.email).slice(0, 100) : null,
          jefeInmediato: row.managerNoEmpleado ? String(row.managerNoEmpleado).slice(0, 10) : null,
          proveedor,
          ceco,
          status,
          fechaAlta: new Date(),
          usuarioUltimaModificacion: actor,
        },
        update: {
          nombre,
          email: row.email ? String(row.email).slice(0, 100) : null,
          jefeInmediato: row.managerNoEmpleado ? String(row.managerNoEmpleado).slice(0, 10) : null,
          proveedor,
          ceco,
          status,
          usuarioUltimaModificacion: actor,
        },
      });

      await prisma.user.update({
        where: { userId: user.userId },
        data: { noEmpleado },
      });

      if (row.managerNoEmpleado) {
        managerLinks.push({
          userId: user.userId,
          managerNoEmpleado: String(row.managerNoEmpleado).slice(0, 10),
        });
      }
      user.noEmpleado = noEmpleado;
    }

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

  // Segunda pasada: resolver managerUserId por no_empleado para soportar adjacency list SAP.
  if (managerLinks.length > 0) {
    const managerNoEmpleadoSet = [...new Set(managerLinks.map((m) => m.managerNoEmpleado))];
    const managerUsers = await prisma.user.findMany({
      where: {
        organizationId: orgIdBig,
        noEmpleado: { in: managerNoEmpleadoSet },
      },
      select: { userId: true, noEmpleado: true },
    });
    const managerByNoEmpleado = new Map(
      managerUsers.map((u) => [String(u.noEmpleado), Number(u.userId)])
    );

    for (const link of managerLinks) {
      const managerUserId = managerByNoEmpleado.get(link.managerNoEmpleado);
      if (!managerUserId || Number(managerUserId) === Number(link.userId)) continue;
      await prisma.user.update({
        where: { userId: Number(link.userId) },
        data: { managerUserId: Number(managerUserId) },
      });
    }
  }

  const createdOrganization = entry.createNewOrganization
    ? {
        id: orgIdBig.toString(),
        nombre: String(entry.newOrgSpec?.nombre ?? ""),
      }
    : undefined;

  return {
    created: created.length,
    skipped,
    createdUsers: created,
    appliedBy: actingUserId,
    failures,
    createdOrganization,
  };
}
