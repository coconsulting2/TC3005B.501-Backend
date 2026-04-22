/*
Admin Routes
*/
import express from "express";
import multer from "multer";
const router = express.Router();
import * as adminController from "../controllers/adminController.js"; // Add .js extension for ES modules
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { validateCreateUser, validateInputs } from "../middleware/validation.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

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

export default router;
