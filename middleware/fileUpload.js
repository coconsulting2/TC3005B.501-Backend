/**
 * @module fileUpload
 * @description Reusable multer middleware configured for PDF and XML uploads.
 * Validates MIME types, enforces a 10 MB file size limit, and provides a
 * centralized error handler for MulterError and invalid file type rejections.
 */
import multer from "multer";

const ALLOWED_MIME_TYPES = ["application/pdf", "application/xml", "text/xml"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Multer fileFilter that only accepts PDF and XML files.
 * Rejects any other MIME type with a typed INVALID_FILE_TYPE error.
 * @type {import('multer').Options['fileFilter']}
 */
const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Invalid file type "${file.mimetype}". Only PDF and XML files are allowed.`
    );
    err.code = "INVALID_FILE_TYPE";
    cb(err);
  }
};

/**
 * Pre-configured multer instance with in-memory storage.
 * Accepted MIME types: application/pdf, application/xml, text/xml.
 * Maximum file size: 10 MB.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Express error-handling middleware for multer upload errors.
 * Must be placed after route handlers that use the upload middleware.
 * - LIMIT_FILE_SIZE → 400 with a human-readable size message
 * - Other MulterError → 400 with multer's built-in message
 * - INVALID_FILE_TYPE → 400 with the fileFilter rejection message
 * - Anything else → forwarded to the next error handler via next(err)
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`,
      });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err?.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({ error: err.message });
  }
  next(err);
};
