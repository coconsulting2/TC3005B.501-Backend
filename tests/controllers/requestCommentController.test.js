/**
 * @file requestCommentController.test.js
 * @description Integration tests for request comment endpoints
 */

import { describe, it, expect, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../../app.js";
import prisma from "../../database/config/prisma.js";
import { createTestJWT } from "../utils/createTestAuthToken.js";

async function createTestFixture() {
  // Use unique suffix per run to avoid unique constraint collisions
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create test organization
  const org = await prisma.organization.create({
    data: {
      nombre: `Test Org Comments ${suffix}`,
      kind: "CLIENT",
      status: "ACTIVE",
    },
  });

  // Create test role
  const role = await prisma.role.create({
    data: {
      roleName: `TestRole-${suffix}`,
      organizationId: org.id,
    },
  });

  // Create test department
  const dept = await prisma.department.create({
    data: {
      departmentName: `TestDept-${suffix}`,
      organizationId: org.id,
    },
  });

  // Create test users with unique usernames/emails
  const requester = await prisma.user.create({
    data: {
      userName: `requester-comment-test-${suffix}`,
      email: `requester-${suffix}@test.com`,
      password: "hashed-password",
      workstation: "TEST-001",
      organizationId: org.id,
      roleId: role.roleId,
      departmentId: dept.departmentId,
    },
  });

  const observer = await prisma.user.create({
    data: {
      userName: `observer-comment-test-${suffix}`,
      email: `observer-${suffix}@test.com`,
      password: "hashed-password",
      workstation: "TEST-002",
      organizationId: org.id,
      roleId: role.roleId,
      departmentId: dept.departmentId,
    },
  });

  // Ensure a PENDING request status exists (RequestStatus is a global catalog)
  let createdStatus = false;
  let status = await prisma.requestStatus.findUnique({ where: { status: "PENDING" } });
  if (!status) {
    status = await prisma.requestStatus.create({ data: { status: "PENDING" } });
    createdStatus = true;
  }

  // Create test request
  const testRequest = await prisma.request.create({
    data: {
      userId: requester.userId,
      organizationId: org.id,
      requestStatusId: status.requestStatusId,
    },
  });

  return { org, testRequest, requester, observer, cleanup };

  async function cleanup() {
    try {
      // Delete comments
      await prisma.requestComment.deleteMany({
        where: { requestId: testRequest.requestId },
      });
    } catch (e) {
      // ignore
    }

    try {
      // Delete request (use deleteMany to avoid throwing if not found)
      await prisma.request.deleteMany({
        where: { requestId: testRequest.requestId },
      });
    } catch (e) {
      // ignore
    }

    try {
      // Delete users created for this org
      await prisma.user.deleteMany({
        where: { organizationId: org.id },
      });
    } catch (e) {
      // ignore
    }

    // Delete other data
    if (createdStatus) {
      try {
        await prisma.requestStatus.deleteMany({
          where: { requestStatusId: status.requestStatusId },
        });
      } catch (e) {
        // ignore (may be referenced by other requests)
      }
    }

    try {
      await prisma.department.deleteMany({ where: { departmentId: dept.departmentId } });
    } catch (e) {
      // ignore
    }
    try {
      await prisma.role.deleteMany({ where: { roleId: role.roleId } });
    } catch (e) {
      // ignore
    }
    try {
      await prisma.organization.deleteMany({ where: { id: org.id } });
    } catch (e) {
      // ignore
    }
  }
}

describe("Request Comment Controller", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /api/solicitudes/:id/comments", () => {
    it("should create a comment successfully", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .post(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .set("Authorization", `Bearer ${createTestJWT("none", { user_id: fixture.requester.userId })}`)
          .send({
            user_id: fixture.requester.userId,
            content: "This is a test comment",
          });

        expect(response.status).toBe(201);
        expect(response.body.message).toBe("Successfully posted comment");

        // Verify comment was persisted
        const comment = await prisma.requestComment.findFirst({
          where: { requestId: fixture.testRequest.requestId },
        });
        expect(comment).toBeDefined();
        expect(comment.content).toBe("This is a test comment");
      } finally {
        await fixture.cleanup();
      }
    });

    it("should return 401 when token is missing", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .post(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .send({
            user_id: fixture.requester.userId,
            content: "This is a test comment",
          });

        expect(response.status).toBe(401);
      } finally {
        await fixture.cleanup();
      }
    });

    it("should return 403 when user mismatches token", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .post(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .set("Authorization", `Bearer ${createTestJWT("none", { user_id: fixture.requester.userId })}`)
          .send({
            user_id: fixture.observer.userId, // Mismatch
            content: "This is a test comment",
          });

        expect(response.status).toBe(403);
      } finally {
        await fixture.cleanup();
      }
    });

    it("should return 400 for invalid content", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .post(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .set("Authorization", `Bearer ${createTestJWT("none", { user_id: fixture.requester.userId })}`)
          .send({
            user_id: fixture.requester.userId,
            content: "", // Empty
          });

        expect(response.status).toBe(400);
      } finally {
        await fixture.cleanup();
      }
    });
  });

  describe("GET /api/solicitudes/:id/comments", () => {
    it("should retrieve comments with pagination", async () => {
      const fixture = await createTestFixture();

      try {
        // Create multiple test comments
        for (let i = 1; i <= 3; i++) {
          await prisma.requestComment.create({
            data: {
              requestId: fixture.testRequest.requestId,
              userId: fixture.requester.userId,
              content: `Comment ${i}`,
            },
          });
        }

        const response = await request(app)
          .get(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .set("Authorization", `Bearer ${createTestJWT("none", { user_id: fixture.requester.userId })}`)
          .query({
            user_id: fixture.requester.userId,
            limit: 10,
          });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("OK");
        expect(response.body.comments).toBeDefined();
        expect(response.body.comments.messages).toHaveLength(3);
      } finally {
        await fixture.cleanup();
      }
    });

    it("should return 401 when token is missing", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .get(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .query({
            user_id: fixture.requester.userId,
            limit: 10,
          });

        expect(response.status).toBe(401);
      } finally {
        await fixture.cleanup();
      }
    });

    it("should return 403 when user mismatches token", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .get(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .set("Authorization", `Bearer ${createTestJWT("none", { user_id: fixture.requester.userId })}`)
          .query({
            user_id: fixture.observer.userId, // Mismatch
            limit: 10,
          });

        expect(response.status).toBe(403);
      } finally {
        await fixture.cleanup();
      }
    });
  });
});

