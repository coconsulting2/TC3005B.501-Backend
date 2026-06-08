/**
 * @module receiptFileService
 * @description Handles receipt file operations: uploading, retrieving, and deleting
 * PDF and XML files in AWS S3 (SSE-S3), with metadata stored in PostgreSQL via Prisma.
 * Validates and parses CFDI XML before storage; UUID duplicado se valida contra cfdi_comprobantes.
 */
import { upload, getObjectStream, deleteObject } from "./storageService.js";
import prisma from "../database/config/prisma.js";
import { parseCFDI, buildComprobanteRegistroBodyFromXml, CfdiParseError } from "./cfdiParserService.js";
import CfdiModel from "../models/cfdiModel.js";
import { assertRequestAllowsReceiptUpload } from "./requestReceiptUploadPolicy.js";

export { CfdiParseError };

/**
 * Uploads a PDF and XML file pair for a receipt to AWS S3.
 * Validates and parses the CFDI XML before uploading: rejects invalid structure
 * and duplicate UUIDs. On success, stores S3 keys en Receipt; el CFDI fiscal completo va por POST /api/comprobantes.
 *
 * @param {number} receiptId - ID of the receipt to associate files with
 * @param {Express.Multer.File} pdfFile - Multer file object for the PDF
 * @param {Express.Multer.File} xmlFile - Multer file object for the XML
 * @returns {Promise<{
 *   pdf: {fileId: string, fileName: string},
 *   xml: {fileId: string, fileName: string},
 *   cfdi: {version: string, rfcEmisor: string, rfcReceptor: string|null, fecha: Date, total: number, uuid: string, taxes: Object}
 * }>}
 * @throws {CfdiParseError} If the XML does not comply with SAT CFDI structure
 * @throws {Error} With code 'DUPLICATE_UUID' if the UUID already exists in the database
 */
export async function uploadReceiptFiles(receiptId, pdfFile, xmlFile) {
  const receiptRow = await prisma.receipt.findUnique({
    where: { receiptId: Number(receiptId) },
    select: { requestId: true, organizationId: true },
  });
  if (!receiptRow?.requestId) {
    const err = new Error("Receipt not found or has no associated request");
    err.status = 404;
    throw err;
  }
  await assertRequestAllowsReceiptUpload(receiptRow.requestId);

  const xmlContent = xmlFile.buffer.toString("utf-8");
  const cfdiData = parseCFDI(xmlContent);

  let registroSugerido = null;
  try {
    registroSugerido = buildComprobanteRegistroBodyFromXml(xmlContent);
  } catch {
    registroSugerido = null;
  }

  const existing = await CfdiModel.findByCfdiUuid(cfdiData.uuid);
  if (existing) {
    const err = new Error(
      `El CFDI con UUID ${cfdiData.uuid} ya está registrado en el comprobante #${existing.receiptId}`
    );
    err.code = "DUPLICATE_UUID";
    err.receiptId = existing.receiptId;
    throw err;
  }

  try {
    const pdfResult = await upload({
      body: pdfFile.buffer,
      organizationId: receiptRow.organizationId,
      viajeId: receiptRow.requestId,
      fileName: pdfFile.originalname,
      contentType: pdfFile.mimetype,
      receiptId,
    });

    const xmlResult = await upload({
      body: xmlFile.buffer,
      organizationId: receiptRow.organizationId,
      viajeId: receiptRow.requestId,
      fileName: xmlFile.originalname,
      contentType: xmlFile.mimetype,
      receiptId,
    });

    await prisma.receipt.update({
      where: { receiptId: Number(receiptId) },
      data: {
        pdfFileKey: pdfResult.key,
        pdfFileName: pdfFile.originalname,
        xmlFileKey: xmlResult.key,
        xmlFileName: xmlFile.originalname,
      },
    });

    // Los datos fiscales completos se persisten en cfdi_comprobantes vía POST /api/comprobantes/:receipt_id

    return {
      pdf: { fileId: pdfResult.key, fileName: pdfFile.originalname },
      xml: { fileId: xmlResult.key, fileName: xmlFile.originalname },
      cfdi: cfdiData,
      registroSugerido,
    };
  } catch (error) {
    console.error("Error uploading receipt files:", error);
    throw error;
  }
}

/**
 * Sube imagen JPG/PNG como comprobante internacional (sin XML ni CFDI).
 * Guarda el binario en S3 y actualiza Receipt (pdf_* como archivo principal).
 *
 * @param {number} receiptId
 * @param {Express.Multer.File} imageFile
 * @returns {Promise<{ image: { fileId: string, fileName: string } }>}
 */
export async function uploadInternationalReceiptImage(receiptId, imageFile) {
  const receiptRow = await prisma.receipt.findUnique({
    where: { receiptId: Number(receiptId) },
    select: { requestId: true, organizationId: true },
  });
  if (!receiptRow?.requestId) {
    const err = new Error("Receipt not found or has no associated request");
    err.status = 404;
    throw err;
  }
  await assertRequestAllowsReceiptUpload(receiptRow.requestId);

  const imageResult = await upload({
    body: imageFile.buffer,
    organizationId: receiptRow.organizationId,
    viajeId: receiptRow.requestId,
    fileName: imageFile.originalname,
    contentType: imageFile.mimetype,
    receiptId,
  });

  await prisma.receipt.update({
    where: { receiptId: Number(receiptId) },
    data: {
      pdfFileKey: imageResult.key,
      pdfFileName: imageFile.originalname,
      xmlFileKey: null,
      xmlFileName: null,
    },
  });

  return { image: { fileId: imageResult.key, fileName: imageFile.originalname } };
}

/**
 * Returns a readable download stream for a receipt file stored in S3.
 * @param {string} key - S3 object key of the file
 * @returns {Promise<{ body: import('stream').Readable, contentType: string|undefined, contentLength: number|undefined }>}
 */
export async function getReceiptFile(key) {
  try {
    return await getObjectStream(key);
  } catch (error) {
    console.error("Error getting receipt file:", error);
    throw error;
  }
}

/**
 * Retrieves S3 keys and names for both PDF and XML files of a receipt.
 * @param {number} receiptId - ID of the receipt to look up
 * @returns {Promise<{pdf: {fileId: string, fileName: string}, xml: {fileId: string, fileName: string}}>}
 */
export async function getReceiptFilesMetadata(receiptId) {
  const receipt = await prisma.receipt.findUnique({
    where: { receiptId: Number(receiptId) },
    select: {
      pdfFileKey: true,
      pdfFileName: true,
      xmlFileKey: true,
      xmlFileName: true,
    },
  });

  if (!receipt) {
    throw new Error("Receipt not found");
  }

  return {
    pdf: { fileId: receipt.pdfFileKey, fileName: receipt.pdfFileName },
    xml: { fileId: receipt.xmlFileKey, fileName: receipt.xmlFileName },
  };
}

/**
 * Deletes both PDF and XML files from AWS S3 for a given receipt.
 * @param {number} receiptId - ID of the receipt whose files should be deleted
 * @returns {Promise<boolean>}
 */
export async function deleteReceiptFiles(receiptId) {
  const receipt = await prisma.receipt.findUnique({
    where: { receiptId: Number(receiptId) },
    select: { pdfFileKey: true, xmlFileKey: true },
  });

  if (!receipt) {
    throw new Error("Receipt not found");
  }

  if (receipt.pdfFileKey) {
    try {
      await deleteObject(receipt.pdfFileKey);
    } catch (error) {
      console.error(`Error deleting PDF file ${receipt.pdfFileKey}:`, error);
    }
  }

  if (receipt.xmlFileKey) {
    try {
      await deleteObject(receipt.xmlFileKey);
    } catch (error) {
      console.error(`Error deleting XML file ${receipt.xmlFileKey}:`, error);
    }
  }

  return true;
}
