/**
 * @module fileController
 * @description Handles HTTP requests for receipt file uploads and downloads (PDF/XML via MongoDB GridFS).
 */
import { ObjectId } from "mongodb";
import sanitize from "mongo-sanitize";
import { uploadReceiptFiles, getReceiptFile, getReceiptFilesMetadata } from "../services/receiptFileService.js";
import { db } from "../services/fileStorage.js";

/**
 * Uploads PDF and XML files for a receipt. Both files are required.
 * Sanitizes all input (receipt ID, filenames) before storage.
 * @param {import('express').Request} req - Express request (params: receipt_id, files: { pdf, xml })
 * @param {import('express').Response} res - Express response
 * @returns {void} 201 JSON with file IDs and names, or 400/500 error
 */
export const uploadReceiptFilesController = async (req, res) => {
  if (!req.files || !req.files.pdf || !req.files.xml) {
    return res.status(400).json({ error: "Both PDF and XML files are required" });
  }

  const receiptId = parseInt(sanitize(req.params.receipt_id), 10);

  try {
    const pdfFile = req.files.pdf[0];
    const xmlFile = req.files.xml[0];

    pdfFile.originalname = sanitize(pdfFile.originalname);
    xmlFile.originalname = sanitize(xmlFile.originalname);

    const result = await uploadReceiptFiles(receiptId, pdfFile, xmlFile);

    res.status(201).json({
      message: "Files uploaded successfully",
      pdf: {
        fileId: result.pdf.fileId,
        fileName: result.pdf.fileName
      },
      xml: {
        fileId: result.xml.fileId,
        fileName: result.xml.fileName
      }
    });
  } catch (error) {
    console.error("Error uploading files:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Downloads a receipt file (PDF or XML) by its MongoDB ObjectId.
 * Streams the file content directly to the response.
 * @param {import('express').Request} req - Express request (params: file_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} File stream with appropriate Content-Type, or 400/404/500 error
 */
export const getReceiptFileController = async (req, res) => {
  try {
    const fileIdStr = sanitize(req.params.file_id);

    if (!ObjectId.isValid(fileIdStr)) {
      return res.status(400).json({ error: "Invalid file ID format" });
    }

    const fileId = new ObjectId(fileIdStr);

    const file = await db.collection("fs.files").findOne({ _id: fileId });
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.set("Content-Type", sanitize(file.contentType));
    res.set("Content-Disposition", `attachment; filename="${sanitize(file.filename)}"`);

    const downloadStream = await getReceiptFile(fileId);
    downloadStream.pipe(res);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves metadata for all files associated with a receipt.
 * @param {import('express').Request} req - Express request (params: receipt_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with file metadata or 404/500 error
 */
export const getReceiptFilesMetadataController = async (req, res) => {
  const receiptId = parseInt(sanitize(req.params.receipt_id), 10);

  try {
    const metadata = await getReceiptFilesMetadata(receiptId);
    res.json(metadata);
  } catch (error) {
    console.error("Error getting receipt files metadata:", error);
    if (error.message === "Receipt not found") {
      return res.status(404).json({ error: "Receipt not found" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
};
