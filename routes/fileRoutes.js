import express from "express";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import { sanitizeMongoInputs } from "../middleware/mongoSanitize.js";
import { upload, handleMulterError } from "../middleware/fileUpload.js";
import {
  uploadReceiptFilesController,
  getReceiptFileController,
  getReceiptFilesMetadataController,
  uploadFile,
  downloadFile
} from "../controllers/fileController.js";
import { authenticateToken } from "../middleware/auth.js";
import { fileValidation, handleMulterErrors } from "../middleware/fileValidation.js";

const router = express.Router();

// Apply sanitization middleware to all routes
router.use(sanitizeMongoInputs);

// Upload both PDF and XML files for a receipt
router.post("/upload-receipt-files/:receipt_id",
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "xml", maxCount: 1 }
  ]),
  uploadReceiptFilesController
);

// Get receipt file (PDF or XML)
router.get("/receipt-file/:file_id", generalRateLimiter, getReceiptFileController);

// Get receipt files metadata (filenames and object ids)
router.get("/receipt-files/:receipt_id", getReceiptFilesMetadataController);

// ------------ S3 Upload Endpoints ------------

// Upload a single file to S3
router.post(
  "/upload",
  authenticateToken,
  fileValidation.single("file"),
  handleMulterErrors,
  uploadFile
);

// Get presigned URL to download a file from S3
router.get("/:id/download", authenticateToken, downloadFile);
// Centralized multer error handler for all file routes
router.use(handleMulterError);

export default router;
