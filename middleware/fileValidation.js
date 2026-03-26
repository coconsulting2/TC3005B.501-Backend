/**
 * @module fileValidation
 * @description Middleware for validating file uploads before sending them to S3.
 */
import multer from "multer";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, JPEG, and PNG are allowed."), false);
  }
};

/**
 * Middleware instance for single file upload named 'file'
 */
export const fileValidation = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

/**
 * Error handler middleware specifically for Multer errors
 * @param {Error} err - Error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next function
 * @returns {void|import('express').Response}
 */
export const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File size exceeds the 10MB limit." });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};
