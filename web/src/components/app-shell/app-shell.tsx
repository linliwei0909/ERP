import Link from "next/link";
import type { ShellContextViewModel } from "@/lib/app-shell/context";
import { NavigationList } from "@/components/app-shell/navigation-list";
import { MobileNavDrawer } from "@/components/app-shell/mobile-nav-drawer";
import { CompanySwitcher } from "@/components/app-shell/company-switcher";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { PageContainer } from "@/components/app-shell/page-container";
import { RouteAnnouncer } from "@/components/app-shell/route-announcer";

export function AppShell({
  context,
  children,
}: {
  context: ShellContextViewModel & {
    selectedCompany: NonNullable<ShellContextViewModel["selectedCompany"]>;
  };
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="shell-skip-link" href="#main-content">
        跳至主要內容
      </a>
      <div className="app-shell">
        <aside className="shell-sidebar" aria-label="應用程式側欄">
          <Link href="/" className="shell-product-identity">
            <span aria-hidden="true">R</span>
            <strong>Ragic 本地端系統</strong>
          </Link>
          <NavigationList groups={context.navigation} />
        </aside>
        <div className="shell-column">
          <header className="shell-top-header">
            <MobileNavDrawer groups={context.navigation} />
            <div className="shell-header-spacer" />
            <CompanySwitcher
              companies={context.authorizedCompanies}
              selectedCompany={context.selectedCompany}
            />
            <UserMenu
              username={context.username}
              roleLabels={context.roleLabels}
              isAdmin={context.isAdmin}
            />
          </header>
          <div
            id="main-content"
            className="shell-main-content"
            tabIndex={-1}
          >
            <Breadcrumbs />
            <PageContainer>{children}</PageContainer>
          </div>
        </div>
      </div>
      <RouteAnnouncer />
    </>
  );
}
