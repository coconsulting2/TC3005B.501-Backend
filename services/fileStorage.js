/**
 * @module fileStorage
 * @description MongoDB GridFS connection and file storage utilities.
 * Provides connect, upload, and download helpers used by receiptFileService.
 */
import { MongoClient, GridFSBucket, ObjectId } from "mongodb";
import dotenv from "dotenv";
import { Readable } from "stream";
import sanitize from "mongo-sanitize";

dotenv.config();

const mongoUrl = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = "fileStorage";

let db;
let bucket;

/**
 * Connects to MongoDB and initializes the GridFS bucket.
 * Must be called once at server startup before any file operations.
 * @returns {Promise<{db: import('mongodb').Db, bucket: import('mongodb').GridFSBucket}>} Active DB and bucket instances
 */
async function connectMongo() {
  try {
    const client = await MongoClient.connect(mongoUrl);
    db = client.db(dbName);
    bucket = new GridFSBucket(db);
    console.log("Connected to MongoDB for file storage");
    return { db, bucket };
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

/**
 * Uploads a file buffer to MongoDB GridFS with sanitized metadata.
 * @param {Buffer} fileBuffer - Raw file content
 * @param {string} fileName - Original file name (will be sanitized)
 * @param {string} fileType - MIME type of the file (will be sanitized)
 * @param {Object} [metadata={}] - Additional metadata to store alongside the file
 * @returns {Promise<{fileId: string, fileName: string}>} ID and sanitized name of the uploaded file
 */
async function uploadFile(fileBuffer, fileName, fileType, metadata = {}) {
  const sanitizedFileName = sanitize(fileName);
  const sanitizedFileType = sanitize(fileType);
  const sanitizedMetadata = sanitize(metadata);

  const readableStream = new Readable();
  readableStream.push(fileBuffer);
  readableStream.push(null);

  const uploadStream = bucket.openUploadStream(sanitizedFileName, {
    contentType: sanitizedFileType,
    metadata: {
      ...sanitizedMetadata,
      uploadDate: new Date(),
    },
  });

  const fileId = uploadStream.id.toString();

  return new Promise((resolve, reject) => {
    readableStream.pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => {
        resolve({ fileId, fileName: sanitizedFileName });
      });
  });
}

/**
 * Opens a GridFS download stream for the given file ID.
 * Accepts a string, raw ObjectId, or existing ObjectId instance.
 * @param {import('mongodb').ObjectId|string} fileId - ID of the file to download
 * @returns {Promise<import('stream').Readable>} GridFS download stream
 */
async function getFile(fileId) {
  // Normalize fileId to an ObjectId instance regardless of input type
  if (!(fileId instanceof ObjectId)) {
    fileId = new ObjectId(typeof fileId === "string" ? sanitize(fileId) : fileId);
  }

  return bucket.openDownloadStream(fileId);
}

export { connectMongo, uploadFile, getFile, db, bucket };
