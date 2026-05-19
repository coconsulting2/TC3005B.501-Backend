/**
 * @module requestCommentService
 * @description Business logic for request comments: create, read, pagination with encrypted cursors.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import prisma from "../database/config/prisma.js";
import { withRls } from "../database/config/rlsConnection.js";
import { Prisma } from "@prisma/client";
import { Logger } from "../utils/log/logger.js";


let CHAT_CURSOR_SECRET = process.env.CHAT_CURSOR_SECRET;
let CHAT_MESSAGE_SECRET = process.env.CHAT_MESSAGE_SECRET;
const ENV = process.env.NODE_ENV || "production";

/**
 *
 * @param key
 */
function validKey(key) {
    return typeof key === "string" && /^[0-9a-f]{64}$/i.test(key);
}

if (!validKey(CHAT_CURSOR_SECRET) || !validKey(CHAT_MESSAGE_SECRET)) {
    if (!(ENV === "development" || ENV === "test")) {
        throw new Error("CHAT_CURSOR_SECRET and CHAT_MESSAGE_SECRETE environment variables must be set at 64 hex" +
            " chars (32 bytes long)");
    }

    console.warn("[requestCommentService] CHAT_CURSOR_SECRET or CHAT_MESSAGE_SECRET not set — " +
        "generating ephemeral keys. This is only acceptable in development/test.");

    CHAT_CURSOR_SECRET = "".padEnd(64, "0");
    CHAT_MESSAGE_SECRET = "".padEnd(64, "0");
}

const CURSOR_SECRET = Buffer.from(CHAT_CURSOR_SECRET, "hex");
const MESSAGE_SECRET = Buffer.from(CHAT_MESSAGE_SECRET, "hex");

const logger = Logger("Request Comment Service");


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
    logger.info({ requestId, userId }, "[requestCommentService] createComment");

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
            logger.warn({ requestId }, "[requestCommentService] createComment — unknown request id");
            return { success: false, error: "Invalid request id" };
        }

        if (!user) {
            logger.warn({ userId }, "[requestCommentService] createComment — unknown user id");
            return { success: false, error: "Invalid user id" };
        }

        await withRls(request.organizationId, {}, async (tx) => {
            await tx.requestComment.create({
                data: {
                    content: encrypt(content, MESSAGE_SECRET),
                    userId,
                    requestId,
                },
            });
        });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
            logger.warn({ userId, requestId }, "[requestCommentService] createComment — FK violation (P2003)");
            return { success: false, error: "Invalid user id or request id" };
        }
        logger.error({ userId, requestId, err }, "[requestCommentService] createComment — unexpected error");
        throw err;
    }

    logger.info({ requestId, userId }, "[requestCommentService] createComment — success");
    return { success: true };
}

/**
 * Reads comments for a request with pagination support.
 * @param {number} requestId - Request ID to fetch comments for
 * @param {number} userId - Current user ID (for filtering own messages)
 * @param {number} limit - Max results per page
 * @param {string} [cursor] - Encrypted cursor for pagination
 * @param {boolean} suscribe
 * @returns {Promise<{success: boolean, data?: Object, next?: string, error?: string}>}
 */
export async function readComments(requestId, userId, limit, {cursor, suscribe = false}) {
    logger[(suscribe? "trace" : "info")]({ requestId, userId, limit, hasCursor: !!cursor },
        "[requestCommentService] readComments"
    );

    const request = await prisma.request.findUnique({
        where: { requestId },
        select: { organizationId: true },
    });
    if (!request) {
        logger.warn({ requestId }, "[requestCommentService] readComments — unknown request id");
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
            logger.debug({ requestId }, "[requestCommentService] readComments — decoding cursor");
            cursorId = decodeID(cursor);
        } catch (err) {
            if (err instanceof Error && err.message === "Tampered tag") {
                logger.warn({ requestId, userId }, "[requestCommentService] readComments — tampered cursor rejected");
                return { success: false, error: "tampered cursor" };
            }
            logger.error({ requestId, err }, "[requestCommentService] readComments — unexpected cursor decode error");
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
            logger.warn({ requestId }, "[requestCommentService] readComments — FK violation (P2003)");
            return { success: false, error: "Invalid request id" };
        }
        logger.error({ requestId, err }, "[requestCommentService] readComments — unexpected DB error");
        throw err;
    }

    const result = { success: true };
    const moreResults = page.length === take;

    if (moreResults) {
        page = page.slice(0, -1);
        const next = page.at(-1)?.id;

        if (next) {
            result.next = encodeID(next);
        }
    }

    const users = new Map();
    const messages = page.map(({ id, at, user, content, ...rest }, index) => {
        const safeAt = new Date(at);
        safeAt.setSeconds(0, 0);
        const userMessage = user.userId === userId;

        if (!userMessage && !users.has(user.userId)) {
            users.set(user.userId, {
                key: encodeID(user.userId),
                name: user.userName,
                role: user.role?.roleName ?? "unknown",
            });
        }

        return {
            pageIndex: index + 1,
            at: safeAt,
            user_key: userMessage ? userId : users.get(user.userId)?.key,
            content: decrypt(content, MESSAGE_SECRET, "Tampered message"),
            ...rest
        };
    });

    logger[(suscribe? "trace" : "info")]({ messagesLength: messages.length, requestId, next: !!result.next },
        "[requestCommentService] readComments"
    );

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
function encodeID(id) {
    return encrypt(id.toString(), CURSOR_SECRET);
}

/**
 * Decodes an encrypted cursor back to numeric ID.
 * @param {string} value - Encrypted cursor
 * @returns {number} Decoded ID
 * @throws {Error} If cursor is tampered or invalid
 */
function decodeID(value) {
    return parseInt(decrypt(value, CURSOR_SECRET));
}

/**
 *
 * @param text
 * @param key
 */
function encrypt(text, key) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/**
 *
 * @param value
 * @param key
 * @param errMessage
 */
function decrypt(value, key, errMessage = "Tampered tag") {
    const buf = Buffer.from(value, "base64url");

    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    try {
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString("utf8");
    } catch (err) {
        throw new Error(errMessage);
    }
}
