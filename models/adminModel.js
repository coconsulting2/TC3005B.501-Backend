/**
 * @module adminModel
 * @description Data access layer for admin-related queries using Prisma.
 */
import prisma from "../database/config/prisma.js";

const Admin = {
  /**
   * Retrieve the list of active users ordered by department.
   * Replaces the UserFullInfo view.
   * @returns {Promise<Array<Object>>} List of active users.
   */
  async getUserList() {
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { departmentId: "asc" },
      include: {
        role: true,
        department: true,
      },
    });

    return users.map((u) => ({
      user_id: u.userId,
      user_name: u.userName,
      email: u.email,
      active: u.active,
      role_name: u.role?.roleName,
      department_name: u.department?.departmentName,
      department_id: u.department?.departmentId,
      phone_number: u.phoneNumber,
    }));
  },

  /**
   * Create multiple users in bulk.
   * @param {Array<Object>} users - Array of user objects to create.
   * @returns {Promise<number>} Number of created rows.
   */
  async createMultipleUsers(users) {
    const data = users.map((user) => ({
      roleId: user.role_id,
      departmentId: user.department_id,
      userName: user.user_name,
      password: user.password,
      workstation: user.workstation,
      email: user.email,
      phoneNumber: user.phone_number,
    }));

    const result = await prisma.user.createMany({
      data,
      skipDuplicates: true,
    });

    return result.count;
  },

  /**
   * Find the role ID for a given role name.
   * @param {string} roleName - Name of the role.
   * @returns {Promise<number|null>} Role ID if found, otherwise null.
   */
  async findRoleId(roleName) {
    const role = await prisma.role.findUnique({
      where: { roleName },
    });
    return role ? role.roleId : null;
  },

  /**
   * Find the department ID for a given department name.
   * @param {string} departmentName - Name of the department.
   * @returns {Promise<number|null>} Department ID if found, otherwise null.
   */
  async findDepartmentId(departmentName) {
    const dept = await prisma.department.findUnique({
      where: { departmentName },
    });
    return dept ? dept.departmentId : null;
  },

  /**
   * Check if a user with the given email exists.
   * @param {string} email - Email address to search for.
   * @returns {Promise<boolean>} True if the user exists.
   */
  async findUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { userId: true },
    });
    return !!user;
  },

  /**
   * Create a single user, ensuring no duplicate email or username.
   * @param {Object} userData - Data for the user to create.
   * @returns {Promise<void>}
   */
  async createUser(userData) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { userName: userData.user_name },
        ],
      },
      select: { userId: true },
    });

    if (existing) {
      throw new Error("User with this email or username already exists");
    }

    await prisma.user.create({
      data: {
        roleId: userData.role_id,
        departmentId: userData.department_id,
        userName: userData.user_name,
        password: userData.password,
        workstation: userData.workstation,
        email: userData.email,
        phoneNumber: userData.phone_number,
      },
    });
  },

  /**
   * Retrieve all user emails.
   * @returns {Promise<Array<Object>>} List of user email records.
   */
  async getAllEmails() {
    const rows = await prisma.user.findMany({
      select: { email: true },
    });
    return rows;
  },

  /**
   * Update a user with the specified fields.
   * Maps snake_case input keys to Prisma camelCase.
   * @param {number} userId - Identifier of the user to update.
   * @param {Object} fieldsToUpdate - Key-value pairs of fields to update.
   * @returns {Promise<Object>} Result of the update operation.
   */
  async updateUser(userId, fieldsToUpdate) {
    // Map snake_case DB column names to Prisma camelCase field names
    const fieldMap = {
      role_id: "roleId",
      department_id: "departmentId",
      user_name: "userName",
      password: "password",
      workstation: "workstation",
      email: "email",
      phone_number: "phoneNumber",
      wallet: "wallet",
      active: "active",
    };

    const prismaData = {};
    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      const prismaKey = fieldMap[key] || key;
      prismaData[prismaKey] = value;
    }

    return await prisma.user.update({
      where: { userId: Number(userId) },
      data: prismaData,
    });
  },

  /**
   * Deactivate a user (soft delete).
   * @param {number} userId - User ID to deactivate.
   * @returns {Promise<boolean>} True if the operation succeeded.
   */
  async deactivateUserById(userId) {
    await prisma.user.update({
      where: { userId: Number(userId) },
      data: { active: false },
    });
    return true;
  },
};

export default Admin;
