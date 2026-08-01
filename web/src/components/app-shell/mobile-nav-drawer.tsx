"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { NavigationGroup } from "@/lib/navigation/registry";
import { NavigationList } from "@/components/app-shell/navigation-list";
import { acquireBodyScrollLock } from "@/lib/ui/body-scroll-lock";

const focusableSelector =
  'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavDrawer({
  groups,
}: {
  groups: NavigationGroup[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const releaseBodyScrollLock = acquireBodyScrollLock();
    const drawer = drawerRef.current;
    const focusable = drawer
      ? Array.from(
          drawer.querySelectorAll<HTMLElement>(focusableSelector),
        )
      : [];
    focusable[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      releaseBodyScrollLock();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="shell-mobile-menu-trigger"
        aria-label="開啟主要導覽"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      {open ? (
        <div
          className="shell-drawer-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={drawerRef}
            className="shell-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="主要導覽"
          >
            <div className="shell-drawer-header">
              <strong>Ragic 本地端系統</strong>
              <button
                type="button"
                aria-label="關閉主要導覽"
                onClick={() => close()}
              >
                ×
              </button>
            </div>
            <NavigationList groups={groups} onNavigate={() => close(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
