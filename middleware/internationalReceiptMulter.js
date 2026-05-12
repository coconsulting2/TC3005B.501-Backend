/**
 * Multer para recibos internacionales: solo JPEG/PNG (TF-010).
 */
import multer from "multer";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png"]);

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Invalid file type "${file.mimetype}". Only JPG and PNG are allowed for international receipts.`
    );
    err.code = "INVALID_FILE_TYPE";
    cb(err);
  }
};

export const internationalReceiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});
