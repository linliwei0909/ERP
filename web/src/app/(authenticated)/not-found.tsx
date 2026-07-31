import { NotFoundState } from "@/components/app-shell/special-states";

export default function AuthenticatedNotFound() {
  return (
    <main className="shell-special-state">
      <NotFoundState />
    </main>
  );
}
