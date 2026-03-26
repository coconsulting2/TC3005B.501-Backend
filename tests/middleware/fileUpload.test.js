import { describe, it, expect, jest, beforeEach, beforeAll } from "@jest/globals";
import multer from "multer";
import express from "express";
import request from "supertest";
import { upload, handleMulterError } from "../../middleware/fileUpload.js";

// ─── Unit tests: handleMulterError ────────────────────────────────────────────

describe("handleMulterError", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it("returns 400 with size message for LIMIT_FILE_SIZE MulterError", () => {
    const err = new multer.MulterError("LIMIT_FILE_SIZE");
    handleMulterError(err, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("10MB") })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 400 for other MulterError codes", () => {
    const err = new multer.MulterError("LIMIT_UNEXPECTED_FILE");
    handleMulterError(err, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: err.message });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 400 for INVALID_FILE_TYPE error", () => {
    const err = new Error("Invalid file type \"text/plain\". Only PDF and XML files are allowed.");
    err.code = "INVALID_FILE_TYPE";
    handleMulterError(err, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: err.message });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("forwards unrecognized errors to next(err)", () => {
    const err = new Error("Unexpected storage failure");
    handleMulterError(err, mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(err);
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

// ─── Integration tests: upload middleware via supertest ───────────────────────

describe("upload middleware (integration)", () => {
  let app;

  beforeAll(() => {
    app = express();

    app.post(
      "/test-upload",
      upload.single("file"),
      (_req, res) => res.status(200).json({ ok: true })
    );

    // Error handler must be registered after routes
    app.use(handleMulterError);
  });

  it("accepts a valid PDF file (application/pdf)", async () => {
    const res = await request(app)
      .post("/test-upload")
      .attach("file", Buffer.from("%PDF-1.4 test"), {
        filename: "receipt.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("accepts a valid XML file (application/xml)", async () => {
    const res = await request(app)
      .post("/test-upload")
      .attach("file", Buffer.from('<?xml version="1.0"?><root/>'), {
        filename: "invoice.xml",
        contentType: "application/xml",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("accepts a valid XML file (text/xml)", async () => {
    const res = await request(app)
      .post("/test-upload")
      .attach("file", Buffer.from('<?xml version="1.0"?><root/>'), {
        filename: "invoice.xml",
        contentType: "text/xml",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects an invalid MIME type with 400", async () => {
    const res = await request(app)
      .post("/test-upload")
      .attach("file", Buffer.from("plain text content"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid file type/);
  });

  it("rejects a file exceeding 10 MB with 400", async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
    const res = await request(app)
      .post("/test-upload")
      .attach("file", largeBuffer, {
        filename: "big.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });
});
