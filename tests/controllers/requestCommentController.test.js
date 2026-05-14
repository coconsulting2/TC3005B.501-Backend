/**
 * @file requestCommentController.test.js
 * @description Integration tests for request comment endpoints
 */

import { describe, it, expect, afterAll, beforeAll } from "@jest/globals";
import request from "supertest";
import app from "../../app.js";
import prisma, { connectPostgres, disconnectPostgres, resetPostgres } from "../../database/config/prisma.js";
import { createTestJWT, LOCALHOST } from "../utils/createTestAuthToken.js";

app.set("trust proxy", "loopback");

let fixtureCounter = 0;

function nextFixtureIds() {
  const seed = (Date.now() % 1_000_000) + fixtureCounter++;
  return {
    orgId: BigInt(10_000_000_000 + seed),
    roleId: 1_000_000 + seed,
    deptId: 2_000_000 + seed,
    requesterId: 3_000_000 + (seed * 2),
    observerId: 3_000_001 + (seed * 2),
    requestId: 4_000_000 + seed,
  };
}

function authHeaders(userId, organizationId) {
  return {
    Authorization: `Bearer ${createTestJWT("none", {
      user_id: userId,
      IP: LOCALHOST,
      organization_id: Number(organizationId),
      organization_kind: "CLIENT",
    })}`,
    "x-forwarded-for": LOCALHOST,
  };
}

async function createTestFixture() {
  const ids = nextFixtureIds();

  // Create test organization
  const org = await prisma.organization.create({
    data: {
      id: ids.orgId,
      nombre: `Test Org Comments ${Date.now()}`,
      kind: "CLIENT",
      status: "ACTIVE",
    },
  });

  // Create test role
  const role = await prisma.role.create({
    data: {
      roleId: ids.roleId,
      roleName: `TestRole-${ids.roleId}`,
      organizationId: org.id,
    },
  });

  // Create test department
  const dept = await prisma.department.create({
    data: {
      departmentId: ids.deptId,
      departmentName: `TestDept-${ids.deptId}`,
      organizationId: org.id,
    },
  });

  // Create test users with unique usernames/emails
  const requester = await prisma.user.create({
    data: {
      userId: ids.requesterId,
      userName: `requester-comment-test-${ids.requesterId}`,
      email: `requester-${ids.requesterId}@test.com`,
      password: "hashed-password",
      workstation: "TEST-001",
      organizationId: org.id,
      roleId: role.roleId,
      departmentId: dept.departmentId,
    },
  });

  const observer = await prisma.user.create({
    data: {
      userId: ids.observerId,
      userName: `observer-comment-test-${ids.observerId}`,
      email: `observer-${ids.observerId}@test.com`,
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
      requestId: ids.requestId,
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
  beforeAll(async () => {
    await connectPostgres();
    await resetPostgres();
  });

  afterAll(async () => {
    await disconnectPostgres();
  });

  describe("POST /api/solicitudes/:id/comments", () => {
    it("should create a comment successfully", async () => {
      const fixture = await createTestFixture();

      try {
        const response = await request(app)
          .post(`/api/solicitudes/${fixture.testRequest.requestId}/comments`)
          .set(authHeaders(fixture.requester.userId, fixture.org.id))
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
          .set(authHeaders(fixture.requester.userId, fixture.org.id))
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
          .set(authHeaders(fixture.requester.userId, fixture.org.id))
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
          .set(authHeaders(fixture.requester.userId, fixture.org.id))
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
          .set(authHeaders(fixture.requester.userId, fixture.org.id))
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

