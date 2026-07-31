"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isNavigationActive,
  type NavigationGroup,
} from "@/lib/navigation/registry";

export function NavigationList({
  groups,
  onNavigate,
}: {
  groups: NavigationGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="主要導覽" className="shell-navigation">
      {groups.map((group) => (
        <section className="shell-navigation-group" key={group.id}>
          <h2>{group.label}</h2>
          <ul>
            {group.items.map((item) => {
              const active = isNavigationActive(item, pathname);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={active ? "is-active" : undefined}
                    onClick={onNavigate}
                  >
                    <span className="shell-navigation-icon" aria-hidden="true">
                      {item.label.slice(0, 1)}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
