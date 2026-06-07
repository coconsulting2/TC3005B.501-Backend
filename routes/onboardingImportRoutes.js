/**
 * @file routes/onboardingImportRoutes.js
 * @description /api/onboarding/import — importación masiva de usuarios para onboarding.
 *
 * Requiere permiso onboarding:import (OrgAdmin y DittaSuperAdmin). Crear org nueva exige organization:create (solo Ditta).
 * Multer: memoria (no disco), límite 2 MB, tipos JSON/CSV.
 */
import express from "express";
import multer  from "multer";
import { requirePermission }  from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import {
  postPreviewImport,
  postApplyImport,
} from "../controllers/onboardingImportController.js";
import { acceptedMimeTypes } from "../services/onboarding/importStrategyResolver.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter(_req, file, cb) {
    const accepted = acceptedMimeTypes();
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    // Acepta también por extensión cuando el SO reporta octet-stream
    const extOk = ["json", "csv", "txt"].includes(ext ?? "");
    if (accepted.includes(file.mimetype) || extOk) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no soportado: ${file.mimetype} (.${ext})`));
    }
  },
});

router.use(generalRateLimiter);

// Fase 1 — parsear y validar sin persistir
router.post(
  "/preview",
  requirePermission("onboarding:import"),
  upload.single("file"),
  postPreviewImport
);

// Fase 2 — persistir usando el token del preview
router.post(
  "/apply",
  requirePermission("onboarding:import"),
  postApplyImport
);

export default router;
