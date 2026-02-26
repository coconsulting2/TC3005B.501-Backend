/**
 * @module adminService
 * @description Handles user management operations for admin functionality,
 * including single-user creation, CSV bulk import, user data retrieval and updates.
 */
import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
const AES_SECRET_KEY = process.env.AES_SECRET_KEY;
const AES_IV = process.env.AES_IV;
import { parse } from "csv-parse";
import fs, { unlink } from "fs";
import { decrypt } from "../middleware/decryption.js";

const requiredColumns = ["role_name", "department_name", "user_name", "password", "workstation", "email"];

const encrypt = (data) => {
  const IV = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(AES_SECRET_KEY), IV);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  return IV.toString("hex") + encrypted;
};

const hash = async (data) => {
  return await bcrypt.hash(data, 10);
};

/**
 * Creates a new user, hashing the password and encrypting PII fields.
 * Throws if the email is already registered.
 *
 * @param {Object} userData - User data
 * @param {number} userData.role_id - Role ID
 * @param {number} userData.department_id - Department ID
 * @param {string} userData.user_name - Username
 * @param {string} userData.password - Plain-text password (will be hashed)
 * @param {string} userData.workstation - Workstation identifier
 * @param {string} userData.email - Email address (will be encrypted)
 * @param {string} userData.phone_number - Phone number (will be encrypted)
 * @returns {Promise<Object>} The created user record
 */
/**
 *
 * @param userData
 */
export async function createUser(userData) {
  try {
    const hashedPassword = await hash(userData.password);

    const allEmails = await Admin.getAllEmails();

    const emailExists = allEmails.some(email => {
    const encryptedEmailString = email.email;

    const existingDecryptedEmail = decrypt(encryptedEmailString);

    const matchFound = existingDecryptedEmail === userData.email;
    return matchFound;
  });

  if (emailExists) {
    throw { status: 400, message: "Email already in use by another user" };
  }

    const encryptedEmail = encrypt(userData.email);
    const encryptedPhone = encrypt(userData.phone_number);

    const newUser = {
      role_id: userData.role_id,
      department_id: userData.department_id,
      user_name: userData.user_name,
      password: hashedPassword,
      workstation: userData.workstation,
      email: encryptedEmail,
      phone_number: encryptedPhone
    };
    return await Admin.createUser(newUser);
  } catch (error) {
    throw new Error(`Error creating user: ${error.message}`);
  }
};

const validateUserRow = async (rowData, rowNumber, existingEmailsInCsv, existingUsernamesInCsv) => {
  const rowErrors = [];

  requiredColumns.forEach(col => {
    if (rowData[col] === null || rowData[col] === undefined || String(rowData[col]).trim() === ""){
      rowErrors.push(`Column '${col}' is required and cannot be empty`);
    }
  });

  const allEmails = await Admin.getAllEmails();

  const emailExists = allEmails.some(email => {
    const encryptedEmailString = email.email;

    const existingDecryptedEmail = decrypt(encryptedEmailString);

    const matchFound = existingDecryptedEmail === rowData.email;
    return matchFound;
  });

  if (emailExists) {
    rowErrors.push(`Email '${rowData.email}' already exists`);
  }

  if (existingEmailsInCsv.has(rowData.email)) {
    rowErrors.push(`Email '${rowData.email}' is a duplicate within the CSV file`);
  } else {
    existingEmailsInCsv.add(rowData.email);
  }

  if (existingUsernamesInCsv.has(rowData.username)) {
    rowErrors.push(`Username '${rowData.username}' is a duplicate within the CSV file`);
  } else if (rowData.username) {
    existingUsernamesInCsv.add(rowData.username);
  }

  if (rowErrors.length > 0) {
    return { row_number: rowNumber, error: rowErrors.join(", ") };
  }

  return null;
};

const getForeignKeyValues = async (rowData, rowNumber) => {
  const rowErrors = [];
  const userData = {...rowData};

  try {
    const roleId = await Admin.findRoleId(userData.role_name);
    if (roleId === null) {
      rowErrors.push(`Invalid role name: '${userData.role_name}'`);
    } else {
      userData.role_id = roleId;
    }

    const departmentId = await Admin.findDepartmentId(userData.department_name);
    if (departmentId === null) {
      rowErrors.push (`Invalid department name: '${userData.department_name}'`);
    } else {
      userData.department_id = departmentId;
    }

    const hashedPassword = await hash(userData.password);
    userData.password = hashedPassword;

    const encryptedEmail = encrypt(userData.email);
    userData.email = encryptedEmail;

    const encryptedPhone = encrypt(userData.phone_number);
    userData.phone_number = encryptedPhone;

  } catch (error) {
    rowErrors.push(`Error processing row ${rowNumber}`);
  }

  if (rowErrors.length > 0){
    return { row_number: rowNumber, error: rowErrors.join(", ") };
  }

  delete userData.role_name;
  delete userData.department_name;

  return userData;
};

/**
 * Parses a CSV file to bulk-create users, validating each row for required
 * fields, duplicate emails/usernames, and valid foreign-key values.
 *
 * @param {string} filePath - Absolute path to the uploaded CSV file
 * @param {boolean} dummy - When true, the file is NOT deleted after processing (used in tests)
 * @returns {Promise<Object>} Summary with total_records, created, failed counts and an errors array
 */
export const parseCSV = async (filePath, dummy) => {
  const results = {
    total_records: 0,
    created: 0,
    failed: 0,
    errors: []
  };
  let rowNumber = 0;
  const usersToCreate = [];

  const existingEmailsInCsv = new Set();
  const existingUsernamesInCsv = new Set();

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);

    const stream = fs.createReadStream(filePath);
    const parser = stream.pipe(parse({
      columns: true,
      skip_empty_lines: true,
      trim: true
    }));

    stream.on("error", (err) => {
      parser.emit("error", err);
    });

    parser.on("error", (err) => {
      results.errors.push({
        row_number: "N/A",
        error: `CSV parsing failed ${err.message}`
      });
    });

    for await (const record of parser) {
      rowNumber++;
      results.total_records++;

      const rowValidationError = await validateUserRow(record, rowNumber,existingEmailsInCsv, existingUsernamesInCsv);

      if (rowValidationError) {
        results.failed++;
        results.errors.push(rowValidationError);
        continue;
      }

      const idValidation = await getForeignKeyValues(record, rowNumber);

      if (idValidation && idValidation.error) {
        results.failed++;
        results.errors.push(idValidation);
      } else {
        usersToCreate.push(idValidation);
      }
    }

    if (usersToCreate.length > 0) {
      try {
        const createdCount = await Admin.createMultipleUsers(usersToCreate);
        results.created = createdCount;
        results.failed += (usersToCreate.length - createdCount);
      } catch (error) {
        results.errors.push({
          row_number: "N/A",
          error: "Bulk insert failed"
        });
        results.failed += usersToCreate.length;
      }
    }
  } catch (error) {
    if (!results.errors.some(err => err.row_number === "N/A" && err.error.includes("CSV parsing failed"))) {
      results.errors.push({
        row_number: "N/A",
        error: `Error processing CSV file: ${error.message}`
      });
    }

    results.failed = results.total_records - results.created;
  } finally {
    if (!dummy) {
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
          results.errors.push({
          row_number: "N/A",
          error: `Error unlinking CSV file: ${error.message}`
        });
      }
    }
  }

  return results;
};

/**
 * Retrieves all users, decrypting their email and phone number fields.
 *
 * @returns {Promise<Array<Object>>} Array of user objects with decrypted PII fields
 */
export async function getUserList() {
  try {
    const users = await Admin.getUserList();

    return users.map(user => {
      const decryptedUser = { ...user };
      decryptedUser.email = decrypt(user.email);
      decryptedUser.phone_number = decrypt(user.phone_number);
      return decryptedUser;
    });
  } catch (error) {
    throw new Error(`Error fetching user list: ${error.message}`);
  }
};

/**
 * Updates a user's fields, encrypting PII and resolving foreign-key names
 * before persisting. Only fields that actually changed are written.
 *
 * @param {number} userId - ID of the user to update
 * @param {Object} newUserData - Partial user object containing only the fields to update
 * @returns {Promise<Object>} Result message and, when changes occurred, an updated_fields array
 */
export const updateUserData = async (userId, newUserData) => {
    const userData = await User.getUserData(userId);
    if (!userData) {
        throw { status: 404, message: "No information found for the user" };
    }

    if (typeof userData.phone_number !== "string") {
        throw { status: 500, message: "Internal server error: Invalid phone number format in database." };
    }

    const currPhoneNumber = decrypt(userData.phone_number);

    if (typeof userData.email !== "string") {
        throw { status: 500, message: "Internal server error: Invalid email format in database." };
    }
    const currUserEmail = decrypt(userData.email);

    if (newUserData.email !== undefined && newUserData.email !== currUserEmail) {
      const allEmailRecords = await Admin.getAllEmails();

      const isEmailAlreadyInUse = allEmailRecords.some(emailRecord => {
            const encryptedEmailString = emailRecord.email;

            if (typeof encryptedEmailString !== "string") {
                return false;
            }

            const existingDecryptedEmail = decrypt(encryptedEmailString);

            const matchFound = existingDecryptedEmail === newUserData.email && encryptedEmailString !== userData.email;
            return matchFound;
        });

      if (isEmailAlreadyInUse) {
            throw { status: 400, message: "Email already in use by another user" };
        }
    }

    const updatedFields = [];
    const fieldsToUpdateInDb = {};
    const keysToCompare = ["role_name", "department_name", "user_name", "workstation", "email", "phone_number"];

    for (const key of keysToCompare) {
        if (newUserData[key] !== undefined) {
            let actualCurrentValue;

            if (key === "email") {
                actualCurrentValue = currUserEmail;
            } else if (key === "phone_number") {
                actualCurrentValue = currPhoneNumber;
            } else {
                actualCurrentValue = userData[key];
            }

            if (newUserData[key] !== actualCurrentValue) {
                if (key === "role_name") {
                    const roleID = await Admin.findRoleID(newUserData[key]);
                    if (roleID !== null) {
                        fieldsToUpdateInDb.role_id = roleID;
                        updatedFields.push(key);
                    } else {
                        throw { status: 400, message: `Invalid role name provided: ${newUserData[key]}` };
                    }
                } else if (key === "department_name") {
                    const deptId = await Admin.findDepartmentID(newUserData[key]);
                    if (deptId !== null) {
                        fieldsToUpdateInDb.department_id = deptId;
                        updatedFields.push(key);
                    } else {
                        throw { status: 400, message: `Invalid department name provided: ${newUserData[key]}` };
                    }
                } else if (key === "email" || key === "phone_number") {
                    const encryptedNewValue = encrypt(newUserData[key]);
                    fieldsToUpdateInDb[key] = encryptedNewValue;
                    updatedFields.push(key);
                } else if (key === "user_name") {
                    const userExists = await User.getUserUsername(newUserData[key]);
                    if (!userExists || userExists.user_id === userId) {
                        fieldsToUpdateInDb[key] = newUserData[key];
                        updatedFields.push(key);
                    } else {
                        throw { status: 400, message: `Username already in use by another user: ${newUserData[key]}` };
                    }
                } else {
                    fieldsToUpdateInDb[key] = newUserData[key];
                    updatedFields.push(key);
                }
            }
        }
    }

    if (Object.keys(fieldsToUpdateInDb).length > 0) {
        await Admin.updateUser(userId, fieldsToUpdateInDb);
        return { message: "User updated successfully", updated_fields: updatedFields };
    }

    return { message: "No changes detected, user data is up to date" };
};

export default {
  createUser,
  getUserList,
  parseCSV,
  updateUserData
};
