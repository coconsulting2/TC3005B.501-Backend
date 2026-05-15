/*
Admin Routes
*/
import express from "express";
import multer from "multer";
import { body } from "express-validator";
const router = express.Router();
import * as adminController from "../controllers/adminController.js"; // Add .js extension for ES modules
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { validateCreateUser, validateInputs } from "../middleware/validation.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const validateManagerCycleBody = [
  body("user_id").isInt({ min: 1 }).toInt().withMessage("user_id must be a positive integer"),
  body("proposed_manager_user_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt()
    .withMessage("proposed_manager_user_id must be null or a positive integer"),
];

const upload = multer({
    dest: "uploads/"
});

router.use((req, res, next) => {
    next();
});

router.route("/get-user-list")
    .get(generalRateLimiter, ...requirePermission("user:list"), adminController.getUserList);

router.route("/create-user")
    .post(generalRateLimiter, ...requirePermission("user:create"), validateCreateUser, validateInputs, adminController.createUser);

router.route("/create-multiple-users")
    .post(
        generalRateLimiter,
        ...requirePermission("user:create"),
        upload.single("file"),
        adminController.createMultipleUsers
    );

router.route("/update-user/:user_id")
    .put(generalRateLimiter, ...requirePermission("user:edit"), adminController.updateUser);

router.route("/delete-user/:user_id")
    .put(generalRateLimiter, ...requirePermission("user:edit"), adminController.deactivateUser);

router.route("/employees/sync")
    .post(generalRateLimiter, ...requirePermission("user:edit"), adminController.syncEmployee);

router.route("/employees")
    .get(generalRateLimiter, ...requirePermission("user:list"), adminController.getEmployees);

router.route("/employees/validate-manager-cycle")
    .post(
        generalRateLimiter,
        ...requirePermission("user:edit"),
        validateManagerCycleBody,
        validateInputs,
        adminController.validateManagerCycle,
    );

router.route("/users/:user_id/employee-link")
    .put(generalRateLimiter, ...requirePermission("user:edit"), adminController.linkUserEmployee);

export default router;
