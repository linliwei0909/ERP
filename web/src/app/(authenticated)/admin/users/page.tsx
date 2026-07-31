import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  let context;

  try {
    context = await getPageRequestContext();
  await requireAdminWithAudit(prisma, context);
  } catch {
    redirect("/");
  }

  const [users, roles, companies] = await Promise.all([
    prisma.user.findMany({
      orderBy: { normalizedUsername: "asc" },
      include: {
        roleAssignments: { include: { role: true } },
        companyScopes: { include: { company: true } },
        defaultCompany: true,
      },
    }),
    prisma.role.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
    }),
    prisma.company.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">管理員功能</p>
          <h1 className="text-3xl font-bold">使用者管理</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>

      <section className="mt-8 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">建立使用者</h2>
        <form
          method="post"
          action="/api/admin/users"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <label className="text-sm font-medium">
            帳號
            <input
              name="username"
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            初始密碼
            <input
              type="password"
              name="password"
              minLength={12}
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">角色</legend>
            <div className="mt-2 space-y-2">
              {roles.map((role) => (
                <label key={role.id} className="block text-sm">
                  <input
                    type="checkbox"
                    name="roleCodes"
                    value={role.code}
                    className="mr-2"
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">公司授權</legend>
            <div className="mt-2 space-y-2">
              {companies.map((company) => (
                <label key={company.id} className="block text-sm">
                  <input
                    type="checkbox"
                    name="companyIds"
                    value={company.id}
                    className="mr-2"
                  />
                  {company.code}－{company.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium">
            預設公司
            <select
              name="defaultCompanyId"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">無</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code}－{company.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">
              建立使用者
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8 space-y-4">
        {users.map((user) => (
          <article key={user.id} className="rounded-2xl border bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">{user.username}</h2>
                <p className="text-sm text-slate-500">
                  {user.status === "ACTIVE" ? "啟用" : "停用"} ·{" "}
                  {user.roleAssignments
                    .map((assignment) => assignment.role.name)
                    .join("、") || "無角色"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  公司：
                  {user.companyScopes
                    .map((scope) => scope.company.name)
                    .join("、") || "無"}
                  {user.defaultCompany
                    ? `；預設：${user.defaultCompany.name}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form
                  method="post"
                  action={`/api/admin/users/${user.id}/status`}
                >
                  <input
                    type="hidden"
                    name="status"
                    value={user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}
                  />
                  <input type="hidden" name="reason" value="管理員操作" />
                  <button className="rounded-lg border px-3 py-2 text-sm">
                    {user.status === "ACTIVE" ? "停用" : "重新啟用"}
                  </button>
                </form>
                <form
                  method="post"
                  action={`/api/admin/users/${user.id}/sessions/revoke`}
                >
                  <input
                    type="hidden"
                    name="reason"
                    value="管理員撤銷全部 Session"
                  />
                  <button className="rounded-lg border px-3 py-2 text-sm">
                    撤銷全部 Session
                  </button>
                </form>
              </div>
            </div>

            <form
              method="post"
              action={`/api/admin/users/${user.id}/access`}
              className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-3"
            >
              <fieldset>
                <legend className="text-sm font-medium">角色</legend>
                {roles.map((role) => (
                  <label key={role.id} className="mt-2 block text-sm">
                    <input
                      type="checkbox"
                      name="roleCodes"
                      value={role.code}
                      defaultChecked={user.roleAssignments.some(
                        (assignment) => assignment.roleId === role.id,
                      )}
                      className="mr-2"
                    />
                    {role.name}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">公司</legend>
                {companies.map((company) => (
                  <label key={company.id} className="mt-2 block text-sm">
                    <input
                      type="checkbox"
                      name="companyIds"
                      value={company.id}
                      defaultChecked={user.companyScopes.some(
                        (scope) => scope.companyId === company.id,
                      )}
                      className="mr-2"
                    />
                    {company.name}
                  </label>
                ))}
              </fieldset>
              <div>
                <label className="text-sm font-medium">
                  預設公司
                  <select
                    name="defaultCompanyId"
                    defaultValue={user.defaultCompanyId ?? ""}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">無</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="hidden"
                  name="reason"
                  value="管理員更新角色及公司授權"
                />
                <button className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
                  更新授權
                </button>
              </div>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
