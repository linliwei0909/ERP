import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  assignUserAccess,
  createManagedUser,
  revokeAllUserSessions,
  setUserStatus,
} from "../../src/lib/auth/admin-users";
import { authenticateCredentials } from "../../src/lib/auth/authentication";
import { requireAdmin } from "../../src/lib/auth/authorization";
import { bootstrapAdmin } from "../../src/lib/auth/bootstrap";
import { hashSessionToken } from "../../src/lib/auth/session-token";
import {
  getSessionContext,
  revokeCurrentSession,
  switchSessionCompany,
} from "../../src/lib/auth/session";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;

describeDatabase("P1.2 authentication and access workflows", () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const suffix = randomUUID().slice(0, 8);
  const adminUsername = `admin-${suffix}`;
  const adminPassword = "Admin-test-password-123";
  let adminUserId: string;
  let adminToken: string;
  let companyAId: string;
  let companyBId: string;
  let orderUserId: string;
  let orderToken: string;

  beforeAll(async () => {
    const bootstrap = await bootstrapAdmin(db, {
      username: adminUsername,
      password: adminPassword,
      companyCode: `A-${suffix}`,
      companyName: `測試公司 A ${suffix}`,
    });
    adminUserId = bootstrap.userId;
    companyAId = (
      await db.company.findUniqueOrThrow({
        where: { code: `A-${suffix}` },
      })
    ).id;
    companyBId = (
      await db.company.create({
        data: {
          code: `B-${suffix}`,
          name: `測試公司 B ${suffix}`,
        },
      })
    ).id;

    const login = await authenticateCredentials(
      db,
      { username: adminUsername, password: adminPassword },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!login.ok) throw new Error("Bootstrap admin login failed");
    adminToken = login.token;

    const orderUser = await createManagedUser(db, adminUserId, {
      username: `order-${suffix}`,
      password: "Order-test-password-123",
      roleCodes: ["ORDER_ENTRY"],
      companyIds: [companyAId, companyBId],
      defaultCompanyId: companyAId,
    });
    orderUserId = orderUser.id;
    const orderLogin = await authenticateCredentials(
      db,
      {
        username: `order-${suffix}`,
        password: "Order-test-password-123",
      },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!orderLogin.ok) throw new Error("Order user login failed");
    orderToken = orderLogin.token;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("bootstraps once and records an audit without password data", async () => {
    const repeated = await bootstrapAdmin(db, {
      username: adminUsername,
      password: adminPassword,
      companyCode: `A-${suffix}`,
      companyName: `測試公司 A ${suffix}`,
    });
    const users = await db.user.count({
      where: { normalizedUsername: adminUsername.toLowerCase() },
    });
    const audits = await db.auditLog.findMany({
      where: {
        entityId: adminUserId,
        action: "bootstrap.created",
      },
    });

    expect(repeated).toEqual({ created: false, userId: adminUserId });
    expect(users).toBe(1);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(adminPassword);
  });

  it("logs in with correct credentials and stores only the token hash", async () => {
    const result = await authenticateCredentials(
      db,
      { username: `  ${adminUsername.toUpperCase()} `, password: adminPassword },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const session = await db.userSession.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(result.token) },
    });
    expect(session.tokenHash).not.toBe(result.token);
    expect(JSON.stringify(session)).not.toContain(result.token);
  });

  it("returns the same failure for a wrong password and an unknown user", async () => {
    const wrongPassword = await authenticateCredentials(
      db,
      { username: adminUsername, password: "Wrong-password-123" },
      { maxFailedAttempts: 10, lockMinutes: 10 },
    );
    const unknownUser = await authenticateCredentials(
      db,
      {
        username: `missing-${suffix}`,
        password: "Wrong-password-123",
      },
      { maxFailedAttempts: 10, lockMinutes: 10 },
    );

    expect(wrongPassword).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
    });
    expect(unknownUser).toEqual(wrongPassword);
  });

  it("locks temporarily and resets failures after a later successful login", async () => {
    const username = `lock-${suffix}`;
    const password = "Lock-test-password-123";
    const user = await createManagedUser(db, adminUserId, {
      username,
      password,
      roleCodes: ["ORDER_ENTRY"],
      companyIds: [companyAId],
      defaultCompanyId: companyAId,
    });
    const now = new Date("2026-07-24T12:00:00Z");

    await authenticateCredentials(
      db,
      { username, password: "Wrong-password-123" },
      { maxFailedAttempts: 2, lockMinutes: 10 },
      now,
    );
    await authenticateCredentials(
      db,
      { username, password: "Wrong-password-123" },
      { maxFailedAttempts: 2, lockMinutes: 10 },
      now,
    );

    const locked = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(locked.failedLoginAttempts).toBe(2);
    expect(locked.lockedUntil?.toISOString()).toBe(
      "2026-07-24T12:10:00.000Z",
    );
    await expect(
      authenticateCredentials(
        db,
        { username, password },
        { maxFailedAttempts: 2, lockMinutes: 10 },
        new Date("2026-07-24T12:05:00Z"),
      ),
    ).resolves.toEqual({ ok: false, code: "INVALID_CREDENTIALS" });

    const success = await authenticateCredentials(
      db,
      { username, password },
      { maxFailedAttempts: 2, lockMinutes: 10 },
      new Date("2026-07-24T12:11:00Z"),
    );
    expect(success.ok).toBe(true);
    const reset = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reset.failedLoginAttempts).toBe(0);
    expect(reset.lockedUntil).toBeNull();
  });

  it("rejects inactive accounts and invalidates their existing sessions atomically", async () => {
    const username = `inactive-${suffix}`;
    const password = "Inactive-test-password-123";
    const user = await createManagedUser(db, adminUserId, {
      username,
      password,
      roleCodes: ["ORDER_ENTRY"],
      companyIds: [companyAId],
      defaultCompanyId: companyAId,
    });
    const login = await authenticateCredentials(
      db,
      { username, password },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!login.ok) throw new Error("Test login failed");

    await setUserStatus(db, adminUserId, {
      userId: user.id,
      status: "INACTIVE",
      reason: "整合測試停用",
    });

    await expect(
      getSessionContext(db, login.token, {
        activityThrottleMinutes: 5,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(
      authenticateCredentials(
        db,
        { username, password },
        { maxFailedAttempts: 3, lockMinutes: 10 },
      ),
    ).resolves.toEqual({ ok: false, code: "INVALID_CREDENTIALS" });

    const audit = await db.auditLog.findFirst({
      where: { entityId: user.id, action: "user.disabled" },
    });
    const activeSessions = await db.userSession.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(audit).not.toBeNull();
    expect(activeSessions).toBe(0);
  });

  it("invalidates logout, expired, and administrator-revoked sessions", async () => {
    const logoutLogin = await authenticateCredentials(
      db,
      {
        username: `order-${suffix}`,
        password: "Order-test-password-123",
      },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!logoutLogin.ok) throw new Error("Test login failed");
    await revokeCurrentSession(db, logoutLogin.token);
    await expect(
      getSessionContext(db, logoutLogin.token, {
        activityThrottleMinutes: 5,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    const expiredLogin = await authenticateCredentials(
      db,
      {
        username: `order-${suffix}`,
        password: "Order-test-password-123",
      },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!expiredLogin.ok) throw new Error("Test login failed");
    await db.userSession.update({
      where: { id: expiredLogin.sessionId },
      data: {
        lastActivityAt: new Date("2026-07-23T16:00:00Z"),
        idleExpiresAt: new Date("2026-07-24T00:00:00Z"),
      },
    });
    await expect(
      getSessionContext(db, expiredLogin.token, {
        activityThrottleMinutes: 5,
        now: new Date("2026-07-24T00:00:01Z"),
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    const revokeLogin = await authenticateCredentials(
      db,
      {
        username: `order-${suffix}`,
        password: "Order-test-password-123",
      },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!revokeLogin.ok) throw new Error("Test login failed");
    await revokeAllUserSessions(db, adminUserId, {
      userId: orderUserId,
      reason: "整合測試撤銷",
    });
    await expect(
      getSessionContext(db, revokeLogin.token, {
        activityThrottleMinutes: 5,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("enforces backend RBAC for ADMIN and ORDER_ENTRY", async () => {
    const adminContext = await getSessionContext(db, adminToken, {
      activityThrottleMinutes: 5,
    });
    expect(() => requireAdmin(adminContext)).not.toThrow();

    const freshOrderLogin = await authenticateCredentials(
      db,
      {
        username: `order-${suffix}`,
        password: "Order-test-password-123",
      },
      { maxFailedAttempts: 3, lockMinutes: 10 },
    );
    if (!freshOrderLogin.ok) throw new Error("Test login failed");
    orderToken = freshOrderLogin.token;
    const orderContext = await getSessionContext(db, orderToken, {
      activityThrottleMinutes: 5,
    });
    expect(() => requireAdmin(orderContext)).toThrow("沒有執行此操作的權限");
  });

  it("switches between authorized companies and rejects a forged company", async () => {
    let context = await getSessionContext(db, orderToken, {
      activityThrottleMinutes: 5,
    });
    expect(context.selectedCompany?.id).toBe(companyAId);

    await switchSessionCompany(db, context, companyBId);
    context = await getSessionContext(db, orderToken, {
      activityThrottleMinutes: 5,
    });
    expect(context.selectedCompany?.id).toBe(companyBId);

    await expect(
      switchSessionCompany(db, context, randomUUID()),
    ).rejects.toMatchObject({ code: "COMPANY_ACCESS_DENIED" });
  });

  it("audits role and company assignment and revokes prior sessions", async () => {
    await assignUserAccess(db, adminUserId, {
      userId: orderUserId,
      roleCodes: ["ORDER_ENTRY"],
      companyIds: [companyAId],
      defaultCompanyId: companyAId,
      reason: "整合測試更新授權",
    });

    const audit = await db.auditLog.findFirst({
      where: {
        entityId: orderUserId,
        action: "user.access_assigned",
      },
      orderBy: { occurredAt: "desc" },
    });
    const activeSessions = await db.userSession.count({
      where: { userId: orderUserId, revokedAt: null },
    });
    expect(audit).not.toBeNull();
    expect(activeSessions).toBe(0);
  });

  it("does not leave partial user or audit data when access validation fails", async () => {
    const username = `rollback-${suffix}`;

    await expect(
      createManagedUser(db, adminUserId, {
        username,
        password: "Rollback-test-password-123",
        roleCodes: ["ORDER_ENTRY"],
        companyIds: [randomUUID()],
        defaultCompanyId: null,
      }),
    ).rejects.toThrow("公司不存在或已停用");

    expect(
      await db.user.count({
        where: { normalizedUsername: username.toLowerCase() },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          action: "user.created",
          afterValue: { path: ["username"], equals: username },
        },
      }),
    ).toBe(0);
  });

  it("rejects missing sessions for protected request context", async () => {
    await expect(
      getSessionContext(db, undefined, {
        activityThrottleMinutes: 5,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
});
