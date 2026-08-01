import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanySwitcher } from "../../src/components/app-shell/company-switcher";
import { PageHeader } from "../../src/components/app-shell/page-header";
import { PageContainer } from "../../src/components/app-shell/page-container";
import {
  NoCompanyState,
  NotFoundState,
} from "../../src/components/app-shell/special-states";
import { UserMenu } from "../../src/components/app-shell/user-menu";
import { toShellContextViewModel } from "../../src/lib/app-shell/view-model";
import type { RequestContext } from "../../src/lib/auth/session";
import {
  buildNavigation,
  isNavigationActive,
  navigationDefinitions,
} from "../../src/lib/navigation/registry";
import { resolveBreadcrumbs } from "../../src/lib/navigation/breadcrumb";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function requestContext(
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return {
    actor: { userId: "user-1", username: "order-user" },
    session: { sessionId: "session-1" },
    requestId: "request-1",
    roleCodes: ["ORDER_ENTRY"],
    authorizedCompanies: [
      { id: "company-a", code: "A", name: "甲公司" },
      { id: "company-b", code: "B", name: "乙公司" },
    ],
    selectedCompany: { id: "company-a", code: "A", name: "甲公司" },
    ...overrides,
  };
}

describe("P4.2 navigation registry", () => {
  it("groups and sorts authorized navigation for ORDER_ENTRY", () => {
    const groups = buildNavigation(["ORDER_ENTRY"]);
    expect(groups.map((group) => group.id)).toEqual([
      "home",
      "master-data",
      "sales",
    ]);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(
      [
        "home",
        "customers",
        "items",
        "pricing",
        "freight",
        "sales-orders",
        "delivery-notes",
      ],
    );
    expect(groups.some((group) => group.id === "system")).toBe(false);
  });

  it("uses ADMIN role gates for the current management routes", () => {
    const admin = buildNavigation(["ADMIN"]);
    const system = admin.find((group) => group.id === "system");
    expect(system?.items).toHaveLength(7);
    expect(
      system?.items.every(
        (item) => item.authorization.kind === "admin-only",
      ),
    ).toBe(true);
  });

  it("records composite permissions and excludes every P5 route", () => {
    const pricing = navigationDefinitions.find((item) => item.id === "pricing");
    const freight = navigationDefinitions.find((item) => item.id === "freight");
    expect(pricing?.authorization).toEqual({
      kind: "permissions",
      allOf: ["customers.read", "items.read", "pricing.read"],
    });
    expect(freight?.authorization).toEqual({
      kind: "permissions",
      allOf: ["customers.read", "freight.read"],
    });
    expect(navigationDefinitions.map((item) => item.href).join(" ")).not.toMatch(
      /inventory|production|purchasing|warehouse|lot|batch|stocktake|costing/,
    );
  });

  it("matches exact home and nested module paths", () => {
    const home = navigationDefinitions.find((item) => item.id === "home")!;
    const orders = navigationDefinitions.find(
      (item) => item.id === "sales-orders",
    )!;
    expect(isNavigationActive(home, "/")).toBe(true);
    expect(isNavigationActive(home, "/customers")).toBe(false);
    expect(isNavigationActive(orders, "/sales-orders/new")).toBe(true);
    expect(isNavigationActive(orders, "/delivery-notes")).toBe(false);
  });
});

describe("P4.2 shell context and presentation", () => {
  it("maps only presentation-safe session fields", () => {
    const viewModel = toShellContextViewModel(requestContext());
    expect(viewModel).toMatchObject({
      username: "order-user",
      isAdmin: false,
      roleLabels: ["訂單作業人員"],
      selectedCompany: { id: "company-a", code: "A", name: "甲公司" },
    });
    expect(viewModel.authorizedCompanies).toHaveLength(2);
    expect(viewModel).not.toHaveProperty("session");
    expect(viewModel).not.toHaveProperty("actor");
    expect(viewModel).not.toHaveProperty("email");
  });

  it("preserves a zero-company result for the dedicated state", () => {
    const viewModel = toShellContextViewModel(
      requestContext({ authorizedCompanies: [], selectedCompany: null }),
    );
    expect(viewModel.selectedCompany).toBeNull();
    expect(viewModel.authorizedCompanies).toEqual([]);
    const html = renderToStaticMarkup(
      <NoCompanyState username={viewModel.username} />,
    );
    expect(html).toContain("尚未取得公司權限");
    expect(html).toContain('/api/auth/logout');
  });

  it("renders single and multiple company controls with the existing API", () => {
    const selected = { id: "company-a", code: "A", name: "甲公司" };
    const single = renderToStaticMarkup(
      <CompanySwitcher companies={[selected]} selectedCompany={selected} />,
    );
    expect(single).toContain("甲公司");
    expect(single).not.toContain("<select");

    const multiple = renderToStaticMarkup(
      <CompanySwitcher
        companies={[
          selected,
          { id: "company-b", code: "B", name: "乙公司" },
        ]}
        selectedCompany={selected}
      />,
    );
    expect(multiple).toContain('action="/api/auth/company"');
    expect(multiple).toContain("<select");
    expect(multiple).toContain("（目前）");
    expect(
      source("src/components/app-shell/company-switcher.tsx"),
    ).toContain("requestSubmit()");
  });

  it("does not invent user email, profile or preferences", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        username="admin"
        roleLabels={["系統管理員"]}
        isAdmin
      />,
    );
    expect(html).toContain("admin");
    expect(html).not.toMatch(/email|profile|preferences|帳號設定/);
  });

  it("renders PageHeader and safe special-state contracts", () => {
    const header = renderToStaticMarkup(
      <PageHeader
        title="測試標題"
        description="測試說明"
        status={<span>啟用</span>}
        primaryAction={<button>儲存</button>}
      />,
    );
    expect(header).toContain("<h1>測試標題</h1>");
    expect(header).toContain("測試說明");
    expect(header).toContain("儲存");
    expect(renderToStaticMarkup(<NotFoundState />)).toContain("404");
  });

  it("renders the formal P4.3d page width and header contracts server-side", () => {
    const widths = renderToStaticMarkup(
      <>
        <PageContainer variant="standard">標準</PageContainer>
        <PageContainer variant="wide">寬版</PageContainer>
        <PageContainer variant="full">全寬</PageContainer>
        <PageContainer variant="default">相容寬版</PageContainer>
        <PageContainer variant="narrow">相容標準</PageContainer>
      </>,
    );
    expect(widths).toContain('data-variant="standard"');
    expect(widths).toContain('data-variant="wide"');
    expect(widths).toContain('data-variant="full"');
    expect(widths).toContain('data-legacy-variant="default"');
    expect(widths).toContain('data-legacy-variant="narrow"');

    const header = renderToStaticMarkup(
      <PageHeader
        containerVariant="wide"
        context="管理員功能"
        title="代表頁面"
        description="頁面說明"
        metadata={[{ label: "目前公司", value: "A－甲公司" }]}
        actions={<button>主要操作</button>}
      />,
    );
    expect(header.match(/<h1/g)).toHaveLength(1);
    expect(header).toContain("管理員功能");
    expect(header).toContain("目前公司");
    expect(header).toContain("主要操作");
    expect(header).not.toContain("<main");

    expect(source("src/app/globals.css")).toMatch(
      /\.shell-user-menu > button \{[\s\S]*?min-height: 44px;/,
    );
  });

  it("gives authenticated error and not-found routes one main landmark", () => {
    for (const path of [
      "src/app/(authenticated)/error.tsx",
      "src/app/(authenticated)/not-found.tsx",
    ]) {
      const routeState = source(path);
      expect(routeState.match(/<main\b/g)).toHaveLength(1);
      expect(routeState.match(/<\/main>/g)).toHaveLength(1);
    }
    expect(source("src/app/(authenticated)/error.tsx")).toContain(
      "correlationId={error.digest}",
    );
    expect(source("src/app/(authenticated)/error.tsx")).toContain(
      "retry={reset}",
    );
    expect(source("src/app/(authenticated)/not-found.tsx")).toContain(
      "<NotFoundState />",
    );
  });
});

describe("P4.2 breadcrumb and route integration", () => {
  it("resolves static, create, detail and admin breadcrumbs", () => {
    expect(resolveBreadcrumbs("/sales-orders/new").map((item) => item.label)).toEqual(
      ["作業首頁", "銷售訂單", "新增訂單"],
    );
    expect(
      resolveBreadcrumbs("/customers/customer-1").at(-1)?.label,
    ).toBe("客戶明細");
    expect(
      resolveBreadcrumbs("/customers/customer-1", {
        customer: "永續商行",
      }).at(-1)?.label,
    ).toBe("永續商行");
    expect(
      resolveBreadcrumbs("/admin/master-import/batch-1").at(-1)?.label,
    ).toBe("匯入批次明細");
  });

  it("keeps login and access-denied outside the authenticated route group", () => {
    expect(source("src/app/login/page.tsx")).toContain("登入");
    expect(source("src/app/access-denied/page.tsx")).toContain(
      "尚未取得公司權限",
    );
    const layout = source("src/app/(authenticated)/layout.tsx");
    expect(layout).toContain("loadShellContext()");
    expect(layout).toContain('redirect("/login")');
    expect(layout).toContain("<AppShell");
    expect(layout).toContain("<NoCompanyState");
  });

  it("implements drawer close, Escape, focus return and route close", () => {
    const drawer = source(
      "src/components/app-shell/mobile-nav-drawer.tsx",
    );
    expect(drawer).toContain('event.key === "Escape"');
    expect(drawer).toContain('event.key !== "Tab"');
    expect(drawer).toContain("triggerRef.current?.focus()");
    expect(drawer).toContain("previousPathname.current !== pathname");
    expect(drawer).toContain("acquireBodyScrollLock()");
    expect(drawer).toContain("releaseBodyScrollLock()");
    expect(drawer).not.toContain('document.body.style.overflow = "hidden"');
    expect(drawer).toContain("event.target === event.currentTarget");
  });

  it("keeps existing page and API authorization in place", () => {
    const page = source(
      "src/app/(authenticated)/delivery-notes/page.tsx",
    );
    const companyRoute = source("src/app/api/auth/company/route.ts");
    expect(page).toContain(
      'requirePermission(context, "delivery_notes.read")',
    );
    expect(companyRoute).toContain("switchSessionCompany");
    expect(companyRoute).toContain('new URL("/", request.url)');
    expect(companyRoute).not.toContain("company.switch");
  });
});
