import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeUsername } from "../src/lib/auth/username";

const baseUrl = process.env.P1_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少必要環境變數：${name}`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|,\s*)(ragic_session=[^;]+)/);
  assert(match, "登入回應未設定 Session cookie");
  assert(/;\s*httponly/i.test(setCookie), "Session cookie 缺少 HttpOnly");
  assert(/;\s*samesite=lax/i.test(setCookie), "Session cookie 缺少 SameSite=Lax");
  return match[1];
}

async function login(username: string, password: string) {
  const form = new FormData();
  form.set("username", username);
  form.set("password", password);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: { origin: baseUrl },
  });
  assert(response.status === 303, "登入未回傳 303");
  const location = response.headers.get("location");
  assert(
    location &&
      new URL(location, baseUrl).pathname === "/" &&
      new URL(location, baseUrl).search === "",
    `登入未成功，redirect=${location ?? "missing"}`,
  );
  return { response, cookie: cookieFrom(response) };
}

async function context(cookie: string) {
  return fetch(`${baseUrl}/api/auth/context`, {
    headers: { cookie },
    redirect: "manual",
  });
}

async function postForm(path: string, cookie: string, form: FormData) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: {
      cookie,
      origin: baseUrl,
    },
  });
}

async function main() {
  const databaseUrl = required("DATABASE_URL");
  const adminUsername = required("BOOTSTRAP_ADMIN_USERNAME");
  const adminPassword = required("BOOTSTRAP_ADMIN_PASSWORD");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const live = await fetch(`${baseUrl}/api/health/live`);
    const ready = await fetch(`${baseUrl}/api/health/ready`);
    assert(live.ok, "health live 失敗");
    assert(ready.ok, "health ready 失敗");
    console.log("PASS health live／ready");

    const wrongForm = new FormData();
    wrongForm.set("username", adminUsername);
    wrongForm.set("password", randomBytes(24).toString("base64url"));
    const wrong = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      body: wrongForm,
      redirect: "manual",
      headers: { origin: baseUrl },
    });
    assert(wrong.status === 303, "錯誤密碼回應不正確");
    assert(
      wrong.headers.get("location")?.includes("/login?error=invalid"),
      "錯誤密碼未使用一致回應",
    );
    assert(
      !wrong.headers.get("set-cookie")?.includes("ragic_session="),
      "錯誤密碼不應建立 Session",
    );
    console.log("PASS wrong password rejected");

    const adminLogin = await login(adminUsername, adminPassword);
    const adminContextResponse = await context(adminLogin.cookie);
    assert(adminContextResponse.ok, "管理員 Session context 失敗");
    const adminContext = (await adminContextResponse.json()) as {
      roleCodes: string[];
      authorizedCompanies: Array<{ id: string; code: string }>;
      selectedCompany: { id: string; code: string } | null;
    };
    assert(adminContext.roleCodes.includes("ADMIN"), "管理員缺少 ADMIN");
    assert(
      adminContext.authorizedCompanies.length === 2,
      "管理員公司授權不是兩家",
    );
    assert(
      adminContext.selectedCompany?.code === "INDUSTRIAL",
      "預設公司不是 INDUSTRIAL",
    );
    const adminPage = await fetch(`${baseUrl}/admin/users`, {
      headers: { cookie: adminLogin.cookie },
      redirect: "manual",
    });
    assert(adminPage.status === 200, "ADMIN 無法進入使用者管理");
    console.log("PASS admin login／RBAC／default company");

    const biotech = adminContext.authorizedCompanies.find(
      (company) => company.code === "BIOTECH",
    );
    assert(biotech, "缺少 BIOTECH scope");
    const switchForm = new FormData();
    switchForm.set("companyId", biotech.id);
    const switched = await postForm(
      "/api/auth/company",
      adminLogin.cookie,
      switchForm,
    );
    assert(switched.status === 303, "公司切換失敗");
    const switchedContext = await context(adminLogin.cookie);
    const switchedBody = (await switchedContext.json()) as {
      selectedCompany: { code: string } | null;
    };
    assert(
      switchedBody.selectedCompany?.code === "BIOTECH",
      "目前公司未切換為 BIOTECH",
    );

    const forgedForm = new FormData();
    forgedForm.set("companyId", randomUUID());
    const forged = await postForm(
      "/api/auth/company",
      adminLogin.cookie,
      forgedForm,
    );
    assert(
      forged.status === 303 &&
        forged.headers
          .get("location")
          ?.includes("company_access_denied"),
      "偽造 companyId 未被拒絕",
    );
    console.log("PASS company switch／forged company rejected");

    const orderUsername = `smoke-order-${Date.now()}`;
    const orderPassword = randomBytes(24).toString("base64url");
    const industrial = adminContext.authorizedCompanies.find(
      (company) => company.code === "INDUSTRIAL",
    );
    assert(industrial, "缺少 INDUSTRIAL scope");
    const createForm = new FormData();
    createForm.set("username", orderUsername);
    createForm.set("password", orderPassword);
    createForm.append("roleCodes", "ORDER_ENTRY");
    createForm.append("companyIds", industrial.id);
    createForm.append("companyIds", biotech.id);
    createForm.set("defaultCompanyId", industrial.id);
    const created = await postForm(
      "/api/admin/users",
      adminLogin.cookie,
      createForm,
    );
    assert(
      created.status === 303 &&
        !created.headers.get("location")?.includes("error="),
      "建立 ORDER_ENTRY 測試帳號失敗",
    );

    const orderUser = await db.user.findUniqueOrThrow({
      where: { normalizedUsername: normalizeUsername(orderUsername) },
      select: { id: true },
    });
    const orderLogin = await login(orderUsername, orderPassword);
    const forbidden = await fetch(`${baseUrl}/admin/users`, {
      headers: { cookie: orderLogin.cookie },
      redirect: "manual",
    });
    assert(
      forbidden.status === 307 && forbidden.headers.get("location") === "/",
      "ORDER_ENTRY 未被管理員頁面拒絕",
    );

    const disableForm = new FormData();
    disableForm.set("status", "INACTIVE");
    disableForm.set("reason", "P1 正式開發環境 smoke test");
    const disabled = await postForm(
      `/api/admin/users/${orderUser.id}/status`,
      adminLogin.cookie,
      disableForm,
    );
    assert(disabled.status === 303, "停用測試帳號失敗");
    const disabledContext = await context(orderLogin.cookie);
    assert(
      disabledContext.status === 401,
      "停用後既有 Session 仍可使用",
    );
    console.log("PASS ORDER_ENTRY restriction／disable revokes Session");

    const logout = await postForm(
      "/api/auth/logout",
      adminLogin.cookie,
      new FormData(),
    );
    assert(logout.status === 303, "登出失敗");
    const loggedOutContext = await context(adminLogin.cookie);
    assert(loggedOutContext.status === 401, "登出後 Session 仍有效");
    console.log("PASS logout revokes Session");

    const requiredAudits = [
      "bootstrap.created",
      "bootstrap.company_scope_added",
      "auth.login.succeeded",
      "user.created",
      "user.disabled",
    ];
    const auditActions = await db.auditLog.findMany({
      where: { operation: { in: requiredAudits } },
      select: { operation: true },
    });
    const present = new Set(auditActions.map((audit) => audit.operation));
    assert(
      requiredAudits.every((action) => present.has(action)),
      "缺少必要 audit action",
    );
    console.log("PASS audit coverage");

    const companies = await db.company.findMany({
      select: { id: true },
    });
    assert(
      companies.every((company) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          company.id,
        ),
      ),
      "公司 UUID 格式不正確",
    );
    console.log("PASS PostgreSQL-generated UUID shape");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "未知錯誤";
  console.error(`Smoke test 失敗：${message}`);
  process.exitCode = 1;
});
