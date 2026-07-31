"use client";

import { usePathname } from "next/navigation";
import { resolveBreadcrumbs } from "@/lib/navigation/breadcrumb";

export function RouteAnnouncer() {
  const pathname = usePathname();
  const items = resolveBreadcrumbs(pathname);
  const message = `已前往${items[items.length - 1]?.label ?? "目前頁面"}`;

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}
