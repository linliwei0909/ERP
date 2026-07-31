import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { NoCompanyState } from "@/components/app-shell/special-states";
import { ShellErrorState } from "@/components/app-shell/shell-error-state";
import { loadShellContext } from "@/lib/app-shell/context";
import { SessionAuthenticationError } from "@/lib/auth/session";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let context;

  try {
    context = await loadShellContext();
  } catch (error) {
    if (error instanceof SessionAuthenticationError) {
      redirect("/login");
    }
    return (
      <main className="shell-special-state">
        <ShellErrorState />
      </main>
    );
  }

  if (!context.selectedCompany) {
    return <NoCompanyState username={context.username} />;
  }

  return (
    <AppShell
      context={{ ...context, selectedCompany: context.selectedCompany }}
    >
      {children}
    </AppShell>
  );
}
