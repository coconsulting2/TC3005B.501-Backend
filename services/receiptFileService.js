/**
 * @module receiptFileService
 * @description Handles receipt file operations: uploading, retrieving, and deleting
 * PDF and XML files in MongoDB GridFS, with metadata stored in PostgreSQL via Prisma.
 */
import { ObjectId } from "mongodb";
import { uploadFile, getFile, db, bucket } from "./fileStorage.js";
import prisma from "../database/config/prisma.js";

/**
 * Uploads a PDF and XML file pair for a receipt to MongoDB GridFS,
 * then updates the receipt record in PostgreSQL with the resulting file IDs.
 * @param {number} receiptId - ID of the receipt to associate files with
 * @param {Express.Multer.File} pdfFile - Multer file object for the PDF
 * @param {Express.Multer.File} xmlFile - Multer file object for the XML
 * @returns {Promise<{pdf: {fileId: string, fileName: string}, xml: {fileId: string, fileName: string}}>}
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

    await prisma.receipt.update({
      where: { receiptId: Number(receiptId) },
      data: {
        pdfFileId: pdfResult.fileId,
        pdfFileName: pdfResult.fileName,
        xmlFileId: xmlResult.fileId,
        xmlFileName: xmlResult.fileName,
      },
    });

    return { pdf: pdfResult, xml: xmlResult };
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
 * @returns {Promise<{pdf: {fileId: string, fileName: string}, xml: {fileId: string, fileName: string}}>}
 */
export async function getReceiptFilesMetadata(receiptId) {
  const receipt = await prisma.receipt.findUnique({
    where: { receiptId: Number(receiptId) },
    select: {
      pdfFileId: true,
      pdfFileName: true,
      xmlFileId: true,
      xmlFileName: true,
    },
  });

  if (!receipt) {
    throw new Error("Receipt not found");
  }

  return {
    pdf: { fileId: receipt.pdfFileId, fileName: receipt.pdfFileName },
    xml: { fileId: receipt.xmlFileId, fileName: receipt.xmlFileName },
  };
}

/**
 * Deletes both PDF and XML files from MongoDB GridFS for a given receipt.
 * @param {number} receiptId - ID of the receipt whose files should be deleted
 * @returns {Promise<boolean>}
 */
export async function deleteReceiptFiles(receiptId) {
  const receipt = await prisma.receipt.findUnique({
    where: { receiptId: Number(receiptId) },
    select: { pdfFileId: true, xmlFileId: true },
  });

  if (!receipt) {
    throw new Error("Receipt not found");
  }

  if (receipt.pdfFileId) {
    try {
      await bucket.delete(new ObjectId(receipt.pdfFileId));
    } catch (error) {
      console.error(`Error deleting PDF file ${receipt.pdfFileId}:`, error);
    }
  }

  if (receipt.xmlFileId) {
    try {
      await bucket.delete(new ObjectId(receipt.xmlFileId));
    } catch (error) {
      console.error(`Error deleting XML file ${receipt.xmlFileId}:`, error);
    }
  }

  return true;
}
