import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Button, Card, Checkbox, EmptyState, Field, FormActions, Input, Section, Select, StatusBadge } from "@/components/ui";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { prisma } from "@/lib/prisma";
import { UserActionButton } from "./user-action-button";
import userStyles from "./users-ui.module.css";

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
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="wide" context="管理員功能" title="使用者管理" description="管理既有角色、公司授權、預設公司、狀態與 Session。" />

      <Card><Section title="建立使用者" description="建立帳號並指派既有角色與公司範圍。">
        <form
          method="post"
          action="/api/admin/users"
          className={pageStyles.formGrid}
        >
          <Field label="帳號" required><Input
              name="username"
              required
            /></Field>
          <Field label="初始密碼" required><Input
              type="password"
              name="password"
              minLength={12}
              required
            /></Field>
          <fieldset>
            <legend className="text-sm font-medium">角色</legend>
            <div className="mt-2 space-y-2">
              {roles.map((role) => (
                <Checkbox key={role.id}
                    name="roleCodes"
                    value={role.code}
                    label={role.name}
                  />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">公司授權</legend>
            <div className="mt-2 space-y-2">
              {companies.map((company) => (
                <Checkbox key={company.id}
                    name="companyIds"
                    value={company.id}
                    label={`${company.code}－${company.name}`}
                  />
              ))}
            </div>
          </fieldset>
          <Field label="預設公司"><Select
              name="defaultCompanyId"
            >
              <option value="">無</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code}－{company.name}
                </option>
              ))}
            </Select></Field>
          <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit">建立使用者</Button>} />
        </form>
      </Section></Card>

      <Section title="使用者清單" description={`共 ${users.length} 位使用者`}>
        {users.length === 0 ? <EmptyState variant="no-data" title="尚無使用者" /> : users.map((user) => (
          <Card key={user.id}>
            <article className={pageStyles.pageStack}>
            <div className={userStyles.userHeader}>
              <div>
                <h2 className="text-lg font-bold">{user.username}</h2>
                <StatusBadge label={user.status === "ACTIVE" ? "啟用" : "停用"} tone={user.status === "ACTIVE" ? "success" : "neutral"} />
                <p className={userStyles.metaText}>
                  {user.roleAssignments
                    .map((assignment) => assignment.role.name)
                    .join("、") || "無角色"}
                </p>
                <p className={userStyles.metaText}>
                  公司：
                  {user.companyScopes
                    .map((scope) => scope.company.name)
                    .join("、") || "無"}
                  {user.defaultCompany
                    ? `；預設：${user.defaultCompany.name}`
                    : ""}
                </p>
              </div>
              <div className={userStyles.actionRow}>
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
                  <UserActionButton label={user.status === "ACTIVE" ? "停用" : "重新啟用"} title={user.status === "ACTIVE" ? "停用使用者" : "重新啟用使用者"} description={`確定要${user.status === "ACTIVE" ? "停用" : "重新啟用"} ${user.username}？`} destructive={user.status === "ACTIVE"} />
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
                  <UserActionButton label="撤銷全部 Session" title="撤銷全部 Session" description={`確定撤銷 ${user.username} 的全部 Session？`} destructive />
                </form>
              </div>
            </div>

            <form
              method="post"
              action={`/api/admin/users/${user.id}/access`}
              className={userStyles.accessGrid}
            >
              <fieldset>
                <legend className="text-sm font-medium">角色</legend>
                {roles.map((role) => (
                  <Checkbox key={role.id}
                      name="roleCodes"
                      value={role.code}
                      defaultChecked={user.roleAssignments.some(
                        (assignment) => assignment.roleId === role.id,
                      )}
                      label={role.name}
                    />
                ))}
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">公司</legend>
                {companies.map((company) => (
                  <Checkbox key={company.id}
                      name="companyIds"
                      value={company.id}
                      defaultChecked={user.companyScopes.some(
                        (scope) => scope.companyId === company.id,
                      )}
                      label={company.name}
                    />
                ))}
              </fieldset>
              <div>
                <Field label="預設公司"><Select
                    name="defaultCompanyId"
                    defaultValue={user.defaultCompanyId ?? ""}
                  >
                    <option value="">無</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </Select></Field>
                <input
                  type="hidden"
                  name="reason"
                  value="管理員更新角色及公司授權"
                />
                <Button type="submit">更新授權</Button>
              </div>
            </form>
            </article>
          </Card>
        ))}
      </Section>
    </div>
  );
}
