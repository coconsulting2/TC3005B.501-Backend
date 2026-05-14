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
  // Create test organization
  const org = await prisma.organization.create({
    data: {
      nombre: "Test Org Comments",
      kind: "CLIENT",
      status: "ACTIVE",
    },
  });

  // Create test role
  const role = await prisma.role.create({
    data: {
      roleName: "TestRole",
      organizationId: org.id,
    },
  });

  // Create test department
  const dept = await prisma.department.create({
    data: {
      departmentName: "TestDept",
      organizationId: org.id,
    },
  });

  // Create test users
  const requester = await prisma.user.create({
    data: {
      userName: "requester-comment-test",
      email: "requester@test.com",
      password: "hashed-password",
      workstation: "TEST-001",
      organizationId: org.id,
      roleId: role.roleId,
      departmentId: dept.departmentId,
    },
  });

  const observer = await prisma.user.create({
    data: {
      userName: "observer-comment-test",
      email: "observer@test.com",
      password: "hashed-password",
      workstation: "TEST-002",
      organizationId: org.id,
      roleId: role.roleId,
      departmentId: dept.departmentId,
    },
  });

  // Create request status
  const status = await prisma.requestStatus.create({
    data: {
      status: "PENDING",
      organizationId: org.id,
    },
  });

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
    // Delete comments
    await prisma.requestComment.deleteMany({
      where: { requestId: testRequest.requestId },
    });
    // Delete request
    await prisma.request.delete({
      where: { requestId: testRequest.requestId },
    });
    // Delete users
    await prisma.user.deleteMany({
      where: { organizationId: org.id },
    });
    // Delete other data
    await prisma.requestStatus.delete({
      where: { requestStatusId: status.requestStatusId },
    });
    await prisma.department.delete({
      where: { departmentId: dept.departmentId },
    });
    await prisma.role.delete({
      where: { roleId: role.roleId },
    });
    await prisma.organization.delete({
      where: { id: org.id },
    });
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
          .set("Authorization", `Bearer ${createTestJWT("none", fixture.requester.userId)}`)
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
          .set("Authorization", `Bearer ${createTestJWT("none", fixture.requester.userId)}`)
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
          .set("Authorization", `Bearer ${createTestJWT("none", fixture.requester.userId)}`)
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
          .set("Authorization", `Bearer ${createTestJWT("none", fixture.requester.userId)}`)
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
          .set("Authorization", `Bearer ${createTestJWT("none", fixture.requester.userId)}`)
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

