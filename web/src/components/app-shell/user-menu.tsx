"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function UserMenu({
  username,
  roleLabels,
  isAdmin,
}: {
  username: string;
  roleLabels: string[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }

  function openMenu(focusLast = false) {
    setOpen(true);
    window.setTimeout(() => {
      const items = menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]',
      );
      (focusLast ? items?.[items.length - 1] : items?.[0])?.focus();
    }, 0);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close();
    }
  }

  return (
    <div className="shell-user-menu">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`開啟 ${username} 的使用者選單`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(true);
          }
        }}
      >
        <span className="shell-user-avatar" aria-hidden="true">
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span className="shell-user-name">{username}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="使用者選單"
          className="shell-user-menu-popover"
          onKeyDown={onMenuKeyDown}
        >
          <div className="shell-user-summary">
            <strong>{username}</strong>
            {roleLabels.length > 0 ? (
              <small>{roleLabels.join("、")}</small>
            ) : null}
          </div>
          {isAdmin ? (
            <Link href="/admin/users" role="menuitem" tabIndex={-1}>
              使用者與授權管理
            </Link>
          ) : null}
          <form method="post" action="/api/auth/logout">
            <button type="submit" role="menuitem" tabIndex={-1}>
              登出
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
