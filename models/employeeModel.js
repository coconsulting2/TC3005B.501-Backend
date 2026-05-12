/**
 * @module employeeModel
 * @description Data access layer for empleado catalog sync.
 */
import prisma from "../database/config/prisma.js";

const EmployeeModel = {
  /**
   * @param {bigint|number|string} organizationId
   * @param {string} noEmpleado
   */
  async findByNoEmpleado(organizationId, noEmpleado) {
    return prisma.empleado.findUnique({
      where: {
        organizationId_noEmpleado: {
          organizationId: BigInt(organizationId),
          noEmpleado: String(noEmpleado),
        },
      },
    });
  },

  /**
   * @param {object} data
   */
  async createEmpleado(data) {
    return prisma.empleado.create({ data });
  },

  /**
   * @param {bigint|number|string} organizationId
   * @param {string} noEmpleado
   * @param {object} data
   */
  async updateEmpleado(organizationId, noEmpleado, data) {
    return prisma.empleado.update({
      where: {
        organizationId_noEmpleado: {
          organizationId: BigInt(organizationId),
          noEmpleado: String(noEmpleado),
        },
      },
      data,
    });
  },

  /**
   * Lista empleados por organización.
   * @param {bigint|number|string} organizationId
   * @param {{ status?: string|null }} [filters]
   */
  async listByOrganization(organizationId, { status = null } = {}) {
    const where = { organizationId: BigInt(organizationId) };
    if (status) where.status = String(status).toUpperCase();
    return prisma.empleado.findMany({
      where,
      orderBy: { noEmpleado: "asc" },
    });
  },
};

export default EmployeeModel;
