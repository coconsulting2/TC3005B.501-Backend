/**
 * @module requestCommentController
 * @description HTTP request handlers for request comments endpoints.
 */

import jwt from "jsonwebtoken";
import * as requestCommentService from "../services/requestCommentService.js";
import { validationResult } from "express-validator";

const JWT_SECRET = process.env.JWT_SECRET || "";

/**
 * Create a comment for a request.
 * POST /api/solicitudes/:id/comments
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void}
 */
export async function createComment(req, res) {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const requestId = parseInt(req.params.id);
    const userId = req.body.user_id;
    const content = req.body.content;

    // Extract and verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure user is only commenting as themselves
    if (decoded.user_id !== userId) {
      return res.status(403).json({ error: "Cannot comment as another user" });
    }

    // Add delay for testing if needed
    if (process.env.NODE_ENV === "test") {
      const delay = Number(process.env.REQUEST_COMMENT_CREATE_DELAY_MS ?? 0);
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const result = await requestCommentService.createComment(userId, requestId, content);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    return res.status(201).json({ message: "Successfully posted comment" });
  } catch (error) {
    console.error("Error creating comment:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Fetch comments for a request with pagination.
 * GET /api/solicitudes/:id/comments
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void}
 */
export async function readComments(req, res) {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const requestId = parseInt(req.params.id);
    const userId = parseInt(req.query.user_id);
    const limit = parseInt(req.query.limit);
    const cursor = req.query.cursor;

    // Extract and verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure user is only reading their own comments
    if (decoded.user_id !== userId) {
      return res.status(403).json({ error: "Cannot read other user comments" });
    }

    const comments = await requestCommentService.readComments(requestId, userId, limit, cursor);

    if (!comments.success) {
      return res.status(404).json({ error: comments.error });
    }

    const response = {
      message: "OK",
      comments: comments.data,
    };

    if (comments.next) {
      response.meta = { limit, next: comments.next };
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error reading comments:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Stream comments for a request via Server-Sent Events (SSE).
 * GET /api/solicitudes/:id/comments/stream
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void}
 */
export async function streamComments(req, res) {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const requestId = parseInt(req.params.id);
    const userId = parseInt(req.query.user_id);
    const limit = parseInt(req.query.limit);

    // Extract and verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure user is only reading their own comments
    if (decoded.user_id !== userId) {
      return res.status(403).json({ error: "Cannot read other user comments" });
    }

    // Set SSE headers
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Send initial batch of comments
    const comments = await requestCommentService.readComments(requestId, userId, limit);

    if (!comments.success) {
      return res.status(404).json({ error: comments.error });
    }

    send(comments);

    // Poll for new comments at regular interval
    const interval = setInterval(async () => {
      try {
        const latestComments = await requestCommentService.readComments(requestId, userId, limit);
        if (latestComments.success) {
          send(latestComments);
        }
      } catch (err) {
        console.error("Error polling comments:", err);
        clearInterval(interval);
      }
    }, Number(process.env.REQUEST_COMMENT_EVENT_INTERVAL_MS ?? 500));

    res.on("close", () => clearInterval(interval));
  } catch (error) {
    console.error("Error streaming comments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

