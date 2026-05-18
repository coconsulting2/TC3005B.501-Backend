/**
 * @module workflowRuleController
 * @description CRUD de reglas de workflow por organización.
 * Scoped a req.tenant.organizationId (multi-tenant).
 */
import prisma from "../database/config/prisma.js";

/**
 * Helper: obtiene el orgId del tenant context.
 * @param {import("express").Request} req
 * @returns {bigint}
 */
function getOrgId(req) {
  const raw = req.tenant?.organizationId ?? req.user?.organization_id;
  if (raw == null) throw new Error("No organization context");
  return BigInt(raw);
}

/**
 * GET /api/workflow-rules
 * Lista todas las reglas de la organización con su departamento.
 */
export async function listRules(req, res) {
  try {
    const orgId = getOrgId(req);
    const rules = await prisma.workflowRule.findMany({
      where: { organizationId: orgId },
      include: { department: { select: { departmentId: true, departmentName: true, costsCenter: true } } },
      orderBy: [{ active: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
    });

    return res.json(
      rules.map((r) => ({
        id: r.id.toString(),
        ruleType: r.ruleType,
        paramType: r.paramType,
        threshold: r.threshold !== null ? Number(r.threshold) : null,
        paramValue: r.paramValue,
        approvalLevel: r.approvalLevel,
        skipIfBelow: r.skipIfBelow !== null ? Number(r.skipIfBelow) : null,
        priority: r.priority,
        active: r.active,
        departmentId: r.departmentId,
        departmentName: r.department?.departmentName ?? null,
        costsCenter: r.department?.costsCenter ?? null,
        managerSteps: r.managerSteps,
        targetRole: r.targetRole,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("listRules error:", err);
    return res.status(500).json({ error: "Error al listar reglas de workflow." });
  }
}

/**
 * GET /api/workflow-rules/departments
 * Lista los departamentos de la organización (para el filtro del panel).
 */
export async function listDepartments(req, res) {
  try {
    const orgId = getOrgId(req);
    const departments = await prisma.department.findMany({
      where: { organizationId: orgId, active: true },
      select: { departmentId: true, departmentName: true, costsCenter: true },
      orderBy: { departmentName: "asc" },
    });
    return res.json(departments);
  } catch (err) {
    console.error("listDepartments error:", err);
    return res.status(500).json({ error: "Error al listar departamentos." });
  }
}

/**
 * GET /api/workflow-rules/roles
 * Lista los roles de la organización (para selects del panel).
 */
export async function listRoles(req, res) {
  try {
    const orgId = getOrgId(req);
    const roles = await prisma.role.findMany({
      where: { organizationId: orgId },
      select: { roleId: true, roleName: true },
      orderBy: { roleName: "asc" },
    });
    return res.json(roles.map((r) => r.roleName));
  } catch (err) {
    console.error("listRoles error:", err);
    return res.status(500).json({ error: "Error al listar roles." });
  }
}

/**
 * POST /api/workflow-rules
 * Crea una nueva regla de workflow.
 */
export async function createRule(req, res) {
  try {
    const orgId = getOrgId(req);
    const {
      ruleType,
      paramType,
      threshold,
      paramValue,
      approvalLevel,
      skipIfBelow,
      priority,
      departmentId,
      managerSteps,
      targetRole,
    } = req.body;

    if (!ruleType || !paramType) {
      return res.status(400).json({ error: "ruleType y paramType son obligatorios." });
    }

    // Validar que departmentId pertenece a esta organización
    if (departmentId != null) {
      const dept = await prisma.department.findFirst({
        where: { departmentId: Number(departmentId), organizationId: orgId },
      });
      if (!dept) {
        return res.status(400).json({ error: "El departamento no pertenece a esta organización." });
      }
    }

    const rule = await prisma.workflowRule.create({
      data: {
        organizationId: orgId,
        ruleType,
        paramType,
        threshold: threshold != null ? threshold : null,
        paramValue: paramValue || null,
        approvalLevel: approvalLevel ?? 1,
        skipIfBelow: skipIfBelow != null ? skipIfBelow : null,
        priority: priority ?? 10,
        departmentId: departmentId != null ? Number(departmentId) : null,
        managerSteps: managerSteps != null ? Number(managerSteps) : null,
        targetRole: targetRole || null,
      },
      include: { department: { select: { departmentId: true, departmentName: true } } },
    });

    return res.status(201).json({
      id: rule.id.toString(),
      ruleType: rule.ruleType,
      paramType: rule.paramType,
      threshold: rule.threshold !== null ? Number(rule.threshold) : null,
      paramValue: rule.paramValue,
      approvalLevel: rule.approvalLevel,
      skipIfBelow: rule.skipIfBelow !== null ? Number(rule.skipIfBelow) : null,
      priority: rule.priority,
      active: rule.active,
      departmentId: rule.departmentId,
      departmentName: rule.department?.departmentName ?? null,
      managerSteps: rule.managerSteps,
      targetRole: rule.targetRole,
    });
  } catch (err) {
    console.error("createRule error:", err);
    return res.status(500).json({ error: "Error al crear regla de workflow." });
  }
}

/**
 * PUT /api/workflow-rules/:id
 * Actualiza una regla existente (scoped a la org).
 */
export async function updateRule(req, res) {
  try {
    const orgId = getOrgId(req);
    const ruleId = BigInt(req.params.id);

    const existing = await prisma.workflowRule.findFirst({
      where: { id: ruleId, organizationId: orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Regla no encontrada." });
    }

    const {
      ruleType,
      paramType,
      threshold,
      paramValue,
      approvalLevel,
      skipIfBelow,
      priority,
      departmentId,
      managerSteps,
      targetRole,
    } = req.body;

    // Validar que departmentId pertenece a esta organización
    if (departmentId != null) {
      const dept = await prisma.department.findFirst({
        where: { departmentId: Number(departmentId), organizationId: orgId },
      });
      if (!dept) {
        return res.status(400).json({ error: "El departamento no pertenece a esta organización." });
      }
    }

    const updated = await prisma.workflowRule.update({
      where: { id: ruleId },
      data: {
        ...(ruleType !== undefined && { ruleType }),
        ...(paramType !== undefined && { paramType }),
        ...(threshold !== undefined && { threshold: threshold != null ? threshold : null }),
        ...(paramValue !== undefined && { paramValue: paramValue || null }),
        ...(approvalLevel !== undefined && { approvalLevel }),
        ...(skipIfBelow !== undefined && { skipIfBelow: skipIfBelow != null ? skipIfBelow : null }),
        ...(priority !== undefined && { priority }),
        ...(departmentId !== undefined && { departmentId: departmentId != null ? Number(departmentId) : null }),
        ...(managerSteps !== undefined && { managerSteps: managerSteps != null ? Number(managerSteps) : null }),
        ...(targetRole !== undefined && { targetRole: targetRole || null }),
      },
      include: { department: { select: { departmentId: true, departmentName: true } } },
    });

    return res.json({
      id: updated.id.toString(),
      ruleType: updated.ruleType,
      paramType: updated.paramType,
      threshold: updated.threshold !== null ? Number(updated.threshold) : null,
      paramValue: updated.paramValue,
      approvalLevel: updated.approvalLevel,
      skipIfBelow: updated.skipIfBelow !== null ? Number(updated.skipIfBelow) : null,
      priority: updated.priority,
      active: updated.active,
      departmentId: updated.departmentId,
      departmentName: updated.department?.departmentName ?? null,
      managerSteps: updated.managerSteps,
      targetRole: updated.targetRole,
    });
  } catch (err) {
    console.error("updateRule error:", err);
    return res.status(500).json({ error: "Error al actualizar regla de workflow." });
  }
}

/**
 * PATCH /api/workflow-rules/:id/toggle
 * Activa o desactiva una regla (soft delete).
 */
export async function toggleRule(req, res) {
  try {
    const orgId = getOrgId(req);
    const ruleId = BigInt(req.params.id);

    const existing = await prisma.workflowRule.findFirst({
      where: { id: ruleId, organizationId: orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Regla no encontrada." });
    }

    const updated = await prisma.workflowRule.update({
      where: { id: ruleId },
      data: { active: !existing.active },
    });

    return res.json({ id: updated.id.toString(), active: updated.active });
  } catch (err) {
    console.error("toggleRule error:", err);
    return res.status(500).json({ error: "Error al cambiar estado de la regla." });
  }
}
