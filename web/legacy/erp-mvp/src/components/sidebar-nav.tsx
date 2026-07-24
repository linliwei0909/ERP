"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { id: string; label: string; icon: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    id: "orders",
    label: "訂單管理",
    icon: "訂",
    items: [
      { href: "/customers", label: "客戶管理", icon: "客" },
      { href: "/price-lists", label: "價格表", icon: "價" },
      { href: "/sales-orders", label: "銷售訂單", icon: "單" },
      { href: "/sales-deliveries", label: "銷貨／出庫", icon: "出" },
    ],
  },
  {
    id: "procurement",
    label: "採購管理",
    icon: "採",
    items: [
      { href: "/suppliers", label: "供應商", icon: "供" },
      { href: "/purchase-requisitions", label: "請購單", icon: "請" },
      { href: "/purchase-orders", label: "採購單", icon: "購" },
      { href: "/goods-receipts", label: "進貨／入庫", icon: "入" },
    ],
  },
  {
    id: "inventory",
    label: "庫存管理",
    icon: "庫",
    items: [
      { href: "/items", label: "品項管理", icon: "品" },
      { href: "/inventory", label: "庫存／異動", icon: "異" },
      { href: "#", label: "生產管理", icon: "製" },
    ],
  },
  {
    id: "finance",
    label: "財會管理",
    icon: "財",
    items: [
      { href: "/ar-invoices", label: "應收發票", icon: "收" },
      { href: "/receipts", label: "收款紀錄", icon: "款" },
      { href: "/ap-invoices", label: "應付發票", icon: "付" },
      { href: "/payments", label: "付款紀錄", icon: "支" },
      { href: "/companies", label: "公司主檔", icon: "司" },
      { href: "#", label: "報表中心", icon: "報" },
      { href: "#", label: "系統設定", icon: "設" },
    ],
  },
];

function belongsTo(pathname: string, href: string) {
  return href !== "#" && (pathname === href || pathname.startsWith(`${href}/`));
}

export function SidebarNav() {
  const pathname = usePathname();
  const activeGroup = navGroups.find((group) => group.items.some((item) => belongsTo(pathname, item.href)))?.id ?? null;
  const [manualState, setManualState] = useState<{ pathname: string; group: string | null }>({ pathname, group: activeGroup });
  const openGroup = manualState.pathname === pathname ? manualState.group : activeGroup;

  return (
    <nav className="mt-7 space-y-1.5" aria-label="主要功能目錄">
      <Link
        href="/"
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${pathname === "/" ? "bg-teal-400 text-slate-950 shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
      >
        <span className="w-6 text-center font-black">⌂</span>
        營運總覽
      </Link>

      {navGroups.map((group) => {
        const isOpen = openGroup === group.id;
        const isActive = activeGroup === group.id;
        return (
          <section key={group.id} className="overflow-hidden rounded-lg">
            <button
              type="button"
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold transition ${isActive ? "bg-white/[0.035] text-teal-300" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              aria-expanded={isOpen}
              aria-controls={`sidebar-group-${group.id}`}
              onClick={() => setManualState({ pathname, group: isOpen ? null : group.id })}
            >
              <span className={`flex size-7 items-center justify-center rounded-md border text-xs font-black ${isActive ? "border-teal-400/30 bg-teal-400/15 text-teal-300" : "border-slate-700 bg-slate-800/70 text-slate-400"}`}>{group.icon}</span>
              <span className="flex-1">{group.label}</span>
              <span aria-hidden="true" className={`text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
            </button>

            {isOpen ? (
              <div id={`sidebar-group-${group.id}`} className="ml-6 border-l border-slate-700/70 py-1 pl-2">
                {group.items.map((item) => {
                  const active = belongsTo(pathname, item.href);
                  return item.href === "#" ? (
                    <span key={`${group.id}-${item.label}`} className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600" title="尚未開放">
                      <span className="w-5 text-center text-xs font-bold">{item.icon}</span>{item.label}
                    </span>
                  ) : (
                    <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${active ? "bg-white/[0.07] font-semibold text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                      <span className={`w-5 text-center text-xs font-bold ${active ? "text-teal-400" : "text-slate-600"}`}>{item.icon}</span>{item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}
