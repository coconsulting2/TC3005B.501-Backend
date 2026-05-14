/**
 * @module requestCommentService
 * @description Business logic for request comments: create, read, pagination with encrypted cursors.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import prisma from "../database/config/prisma.js";
import { withRls } from "../database/config/rlsConnection.js";
import { Prisma } from "@prisma/client";

const CHAT_CURSOR_SECRET = process.env.CHAT_CURSOR_SECRET || process.env.JWT_SECRET || "";
if (!CHAT_CURSOR_SECRET) {
  throw new Error("CHAT_CURSOR_SECRET or JWT_SECRET must be set in environment");
}

const SECRET = Buffer.from(CHAT_CURSOR_SECRET.slice(0, 32).padEnd(32, "0"), "utf-8");

const partialSelect = {
  id: true,
  user: {
    select: {
      userId: true,
      userName: true,
      role: {
        select: {
          roleName: true,
        },
      },
    },
  },
  content: true,
  at: true,
};

/**
 * Creates a new request comment.
 * @param {number} userId - User ID making the comment
 * @param {number} requestId - Request ID for the comment
 * @param {string} content - Comment content
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createComment(userId, requestId, content) {
  try {
    const [request, user] = await Promise.all([
      prisma.request.findUnique({
        where: { requestId },
        select: { organizationId: true },
      }),
      prisma.user.findUnique({
        where: { userId },
        select: { organizationId: true },
      }),
    ]);

    if (!request) {
      return { success: false, error: "Invalid request id" };
    }

    if (!user) {
      return { success: false, error: "Invalid user id" };
    }

    await withRls(request.organizationId, {}, async (tx) => {
      await tx.requestComment.create({
        data: {
          content,
          userId,
          requestId,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { success: false, error: "Invalid user id or request id" };
    }
    throw err;
  }

  return { success: true };
}

/**
 * Reads comments for a request with pagination support.
 * @param {number} requestId - Request ID to fetch comments for
 * @param {number} userId - Current user ID (for filtering own messages)
 * @param {number} limit - Max results per page
 * @param {string} [cursor] - Encrypted cursor for pagination
 * @returns {Promise<{success: boolean, data?: Object, next?: string, error?: string}>}
 */
export async function readComments(requestId, userId, limit, cursor) {
  const request = await prisma.request.findUnique({
    where: { requestId },
    select: { organizationId: true },
  });
  if (!request) {
    return { success: false, error: "Invalid request id" };
  }

  const take = limit + 1;
  const query = {
    where: { requestId },
    take,
    orderBy: { id: "desc" },
  };

  if (cursor) {
    let cursorId;
    try {
      cursorId = decodeCommentCursor(cursor);
    } catch (err) {
      if (err instanceof Error && err.message === "Tampered cursor") {
        return { success: false, error: "tampered cursor" };
      }
      throw err;
    }

    query.skip = 1;
    query.cursor = { id: cursorId };
  }

  let page;
  try {
    page = await withRls(request.organizationId, {}, async (tx) => tx.requestComment.findMany({
      ...query,
      select: partialSelect,
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { success: false, error: "Invalid request id" };
    }
    throw err;
  }

  const result = { success: true };
  const moreResults = page.length === take;

  if (moreResults) {
    page = page.slice(0, -1);
    const next = page.at(-1)?.id;

    if (next) {
      result.next = encodeCommentCursor(next);
    }
  }

  // Group users and anonymize own messages
  const users = new Map();
  const messages = page.map(({ id, at, user, ...rest }, index) => {
    const safeAt = new Date(at);
    safeAt.setSeconds(0, 0);
    const userMessage = user.userId === userId;

    if (!userMessage && !users.has(user.userId)) {
      users.set(user.userId, {
        key: encodeCommentCursor(user.userId),
        name: user.userName,
        role: user.role?.roleName ?? "unknown",
      });
    }

    return {
      pageIndex: index + 1,
      at: safeAt,
      user_key: userMessage ? userId : users.get(user.userId)?.key,
      ...rest,
    };
  });

  result.data = {
    users: Object.fromEntries(Array.from(users.values()).map(({ key, ...rest }) => [key, rest])),
    messages,
  };

  return result;
}

/**
 * Encodes a numeric ID into an encrypted cursor (base64url).
 * @param {number} id - Numeric ID to encode
 * @returns {string} Encrypted cursor
 */
function encodeCommentCursor(id) {
  const value = id.toString();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/**
 * Decodes an encrypted cursor back to numeric ID.
 * @param {string} value - Encrypted cursor
 * @returns {number} Decoded ID
 * @throws {Error} If cursor is tampered or invalid
 */
function decodeCommentCursor(value) {
  const buf = Buffer.from(value, "base64url");

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", SECRET, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return parseInt(decrypted.toString("utf8"));
  } catch (err) {
    throw new Error("Tampered cursor");
  }
}

