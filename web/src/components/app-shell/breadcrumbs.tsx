"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { resolveBreadcrumbs } from "@/lib/navigation/breadcrumb";

export function Breadcrumbs() {
  const pathname = usePathname();
  const items = resolveBreadcrumbs(pathname);
  const mobileReturn = [...items]
    .reverse()
    .find((item) => item.href && item.href !== pathname);

  return (
    <nav aria-label="麵包屑導覽" className="shell-breadcrumb">
      <ol className="shell-breadcrumb-list">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current={item.current ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      {mobileReturn ? (
        <Link className="shell-breadcrumb-mobile" href={mobileReturn.href!}>
          <span aria-hidden="true">←</span> 返回{mobileReturn.label}
        </Link>
      ) : null}
    </nav>
  );
}
