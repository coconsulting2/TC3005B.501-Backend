/**
 * @module storageService
 * @description AWS S3 storage for trip files: upload with SSE-S3 (AES-256), pre-signed GET URLs (15 min), and delete.
 * Object keys: `{orgId}/{viajeId}/[{receiptId}/]{uuid}/{filename}` cuando `receiptId` se envía en el body del upload.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

/** @type {number} Pre-signed URL lifetime in seconds (15 minutes). */
const PRESIGNED_TTL_SECONDS = 15 * 60;

/**
 * Cliente S3: AWS real por defecto; con `AWS_S3_ENDPOINT` (p. ej. LocalStack en dev)
 * se usa endpoint + credenciales explícitas y path-style.
 * @returns {S3Client}
 */
function createS3Client() {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error("AWS_REGION is required for S3");
  }
  const endpoint = process.env.AWS_S3_ENDPOINT?.trim();
  if (endpoint) {
    return new S3Client({
      region,
      endpoint,
      forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      },
    });
  }
  return new S3Client({ region });
}

/**
 * @returns {string}
 */
function getBucketName() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is required for S3");
  }
  return bucket;
}

/**
 * Builds a safe S3 key: org/viaje/uuid/filename (no path traversal).
 * @param {string|number} orgId
 * @param {string|number} viajeId
 * @param {string} fileName
 * @param {string|number|null} [receiptId]
 * @returns {string}
 */
function buildObjectKey(orgId, viajeId, fileName, receiptId) {
  const safeOrg = String(orgId).replace(/[^a-zA-Z0-9-_]/g, "");
  const safeViaje = String(viajeId).replace(/[^a-zA-Z0-9-_]/g, "");
  const base = path.basename(String(fileName) || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = randomUUID();
  const receiptNormalized = receiptId ?? null;
  const receiptRaw = receiptNormalized !== null && String(receiptNormalized).trim() !== "" ? String(receiptNormalized).trim() : "";
  const safeReceipt = receiptRaw.replace(/[^a-zA-Z0-9-_]/g, "");
  const mid = safeReceipt ? `${safeReceipt}/${id}` : id;
  return `${safeOrg}/${safeViaje}/${mid}/${base}`;
}

/**
 * Uploads a file to S3 with server-side encryption (SSE-S3, AES-256).
 * @param {object} params
 * @param {Buffer|Uint8Array|string} params.body - File contents
 * @param {string|number} params.orgId - Organization identifier
 * @param {string|number} params.viajeId - Trip identifier
 * @param {string} params.fileName - Original file name (basename is used)
 * @param {string} [params.contentType] - MIME type; defaults to application/octet-stream
 * @param {string|number} [params.receiptId] - Opcional: segmento de clave S3 alineado con comprobantes
 * @returns {Promise<{ key: string, bucket: string }>}
 */
async function upload({ body, orgId, viajeId, fileName, contentType, receiptId }) {
  const client = createS3Client();
  const bucket = getBucketName();
  const key = buildObjectKey(orgId, viajeId, fileName, receiptId);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      ServerSideEncryption: "AES256"
    })
  );
  return { key, bucket };
}

/**
 * Returns a pre-signed GET URL for downloading the object (15-minute TTL).
 * @param {string} key - Full S3 object key returned from upload
 * @returns {Promise<string>}
 */
async function getPresignedUrl(key) {
  const client = createS3Client();
  const bucket = getBucketName();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: PRESIGNED_TTL_SECONDS });
}

/**
 * Deletes an object from the bucket.
 * @param {string} key - Full S3 object key
 * @returns {Promise<void>}
 */
async function deleteObject(key) {
  const client = createS3Client();
  const bucket = getBucketName();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export { upload, getPresignedUrl, deleteObject, PRESIGNED_TTL_SECONDS };
