/**
 * @module employeeHierarchyService
 * @description Utilidades de jerarquía organizacional (adjacency list) basadas en User.managerUserId.
 */
import Authorizer from "../models/authorizerModel.js";

/**
 * Cadena de aprobación hacia arriba (jefe directo, jefe del jefe, ...).
 * @param {number} userId
 * @param {number} [maxDepth=8]
 * @returns {Promise<number[]>}
 */
export async function getApprovalChain(userId, maxDepth = 8) {
  const chain = [];
  const seen = new Set([Number(userId)]);
  let current = Number(userId);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const managerId = await Authorizer.getManagerUserId(current);
    if (managerId == null) break;
    if (seen.has(Number(managerId))) {
      throw { status: 409, message: "Cycle detected in manager hierarchy" };
    }
    chain.push(Number(managerId));
    seen.add(Number(managerId));
    current = Number(managerId);
  }

  return chain;
}

/**
 * Subordinados transitivos (BFS) de un manager.
 * @param {number} managerUserId
 * @param {number} [maxNodes=2000]
 * @returns {Promise<number[]>}
 */
export async function getSubordinatesRecursive(managerUserId, maxNodes = 2000) {
  const visited = new Set();
  const out = [];
  const queue = [Number(managerUserId)];

  while (queue.length > 0 && out.length < maxNodes) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const direct = await Authorizer.getDirectSubordinates(current);
    for (const s of direct) {
      if (!visited.has(Number(s))) {
        out.push(Number(s));
        queue.push(Number(s));
      }
    }
  }

  return out;
}

/**
 * Profundidad de aprobación disponible para un usuario.
 * @param {number} userId
 * @param {number} [maxDepth=8]
 * @returns {Promise<number>}
 */
export async function getHierarchyDepth(userId, maxDepth = 8) {
  const chain = await getApprovalChain(userId, maxDepth);
  return chain.length;
}

export default {
  getApprovalChain,
  getSubordinatesRecursive,
  getHierarchyDepth,
};
