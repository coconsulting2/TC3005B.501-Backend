/**
 * @module receiptFileService
 * @description Handles receipt file operations: uploading, retrieving, and deleting
 * PDF and XML files in MongoDB GridFS, with metadata stored in MariaDB.
 */
import { ObjectId } from "mongodb";
import { uploadFile, getFile, db, bucket } from "./fileStorage.js";
import pool from "../database/config/db.js";

/**
 * Uploads a PDF and XML file pair for a receipt to MongoDB GridFS,
 * then updates the receipt record in MariaDB with the resulting file IDs.
 * @param {number} receiptId - ID of the receipt to associate files with
 * @param {Express.Multer.File} pdfFile - Multer file object for the PDF
 * @param {Express.Multer.File} xmlFile - Multer file object for the XML
 * @returns {Promise<{pdf: {fileId: string, fileName: string}, xml: {fileId: string, fileName: string}}>} Uploaded file metadata
 */
export async function uploadReceiptFiles(receiptId, pdfFile, xmlFile) {
  try {
    const pdfResult = await uploadFile(
      pdfFile.buffer,
      pdfFile.originalname,
      pdfFile.mimetype,
      { receiptId, fileType: "pdf" }
    );

    const xmlResult = await uploadFile(
      xmlFile.buffer,
      xmlFile.originalname,
      xmlFile.mimetype,
      { receiptId, fileType: "xml" }
    );

    // Update MariaDB with GridFS file IDs so they can be retrieved later
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE Receipt
         SET pdf_file_id = ?, pdf_file_name = ?,
             xml_file_id = ?, xml_file_name = ?
         WHERE receipt_id = ?`,
        [
          pdfResult.fileId, pdfResult.fileName,
          xmlResult.fileId, xmlResult.fileName,
          receiptId,
        ]
      );

      return { pdf: pdfResult, xml: xmlResult };
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("Error uploading receipt files:", error);
    throw error;
  }
}

/**
 * Returns a readable download stream for a receipt file stored in GridFS.
 * @param {import('mongodb').ObjectId} fileId - MongoDB ObjectId of the file
 * @returns {Promise<import('stream').Readable>} GridFS download stream
 */
export async function getReceiptFile(fileId) {
  try {
    return await getFile(fileId);
  } catch (error) {
    console.error("Error getting receipt file:", error);
    throw error;
  }
}

/**
 * Retrieves GridFS file IDs and names for both PDF and XML files of a receipt.
 * @param {number} receiptId - ID of the receipt to look up
 * @returns {Promise<{pdf: {fileId: string, fileName: string}, xml: {fileId: string, fileName: string}}>} File metadata
 * @throws {Error} If the receipt is not found
 */
export async function getReceiptFilesMetadata(receiptId) {
  const conn = await pool.getConnection();
  try {
    const [receipt] = await conn.query(
      `SELECT pdf_file_id, pdf_file_name, xml_file_id, xml_file_name
       FROM Receipt
       WHERE receipt_id = ?`,
      [receiptId]
    );

    if (!receipt) {
      throw new Error("Receipt not found");
    }

    return {
      pdf: { fileId: receipt.pdf_file_id, fileName: receipt.pdf_file_name },
      xml: { fileId: receipt.xml_file_id, fileName: receipt.xml_file_name },
    };
  } finally {
    conn.release();
  }
}

/**
 * Deletes both PDF and XML files from MongoDB GridFS for a given receipt.
 * Errors on individual file deletions are logged but do not abort the operation.
 * @param {number} receiptId - ID of the receipt whose files should be deleted
 * @returns {Promise<boolean>} True if the operation completed
 * @throws {Error} If the receipt is not found or a critical DB error occurs
 */
export async function deleteReceiptFiles(receiptId) {
  const conn = await pool.getConnection();
  try {
    const [receipt] = await conn.query(
      `SELECT pdf_file_id, xml_file_id
       FROM Receipt
       WHERE receipt_id = ?`,
      [receiptId]
    );

    if (!receipt) {
      throw new Error("Receipt not found");
    }

    if (receipt.pdf_file_id) {
      try {
        await bucket.delete(new ObjectId(receipt.pdf_file_id));
      } catch (error) {
        console.error(`Error deleting PDF file ${receipt.pdf_file_id}:`, error);
      }
    }

    if (receipt.xml_file_id) {
      try {
        await bucket.delete(new ObjectId(receipt.xml_file_id));
      } catch (error) {
        console.error(`Error deleting XML file ${receipt.xml_file_id}:`, error);
      }
    }

    return true;
  } catch (error) {
    console.error("Error deleting receipt files:", error);
    throw error;
  } finally {
    conn.release();
  }
}
