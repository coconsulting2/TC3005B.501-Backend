/**
 * @module organizationController
 * @description HTTP layer para gestión de organizaciones (tenants).
 */
import * as organizationService from "../services/organizationService.js";

export async function postOrganization(req, res, next) {
  try {
    const result = await organizationService.createOrganization(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getOrganizations(req, res, next) {
  try {
    const { kind, status, page, pageSize } = req.query;
    const result = await organizationService.listOrganizations({
      kind,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getOrganizationMe(req, res, next) {
  try {
    if (!req.tenant) {
      return res.status(401).json({ error: "No autenticado" });
    }
    const org = await organizationService.getOrganizationMe(req.tenant.jwtOrgId);
    if (!org) return res.status(404).json({ error: "Organización no encontrada" });
    res.json(org);
  } catch (err) {
    next(err);
  }
}

export async function getOrganizationById(req, res, next) {
  try {
    // Ditta puede ver cualquiera (bypass); resto solo su propia org.
    const bypass = req.tenant?.isRoot === true;
    const org = await organizationService.getOrganization(req.params.id, { bypass });
    if (!org) return res.status(404).json({ error: "Organización no encontrada" });
    // Sin Ditta, restringir lectura a la org propia.
    if (!bypass && String(org.id) !== String(req.tenant?.jwtOrgId)) {
      return res.status(404).json({ error: "Organización no encontrada" });
    }
    res.json(org);
  } catch (err) {
    next(err);
  }
}

export async function patchOrganization(req, res, next) {
  try {
    const bypass = req.tenant?.isRoot === true;
    if (!bypass && String(req.params.id) !== String(req.tenant?.jwtOrgId)) {
      return res.status(404).json({ error: "Organización no encontrada" });
    }
    const updated = await organizationService.updateOrganization(req.params.id, req.body, { bypass });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function postActivate(req, res, next) {
  try {
    const updated = await organizationService.activateOrganization(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function postSuspend(req, res, next) {
  try {
    const updated = await organizationService.suspendOrganization(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
