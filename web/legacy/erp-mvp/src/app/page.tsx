import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const [itemCount, warehouseCount, lotCount, movementCount] = await Promise.all([
    prisma.item.count(),
    prisma.warehouse.count(),
    prisma.inventoryLot.count(),
    prisma.stockMovement.count(),
  ]);

  const stats = [
    { label: "品項總數", value: itemCount, unit: "項", tone: "teal" },
    { label: "倉庫", value: warehouseCount, unit: "座", tone: "blue" },
    { label: "庫存批號", value: lotCount, unit: "批", tone: "amber" },
    { label: "本期異動", value: movementCount, unit: "筆", tone: "violet" },
  ];

  const modules = [
    {
      title: "客戶管理",
      items: ["客戶資料", "訂單入口", "客服／售後"],
      href: "/customers",
    },
    {
      title: "銷售管理",
      items: ["報價管理", "銷售訂單", "出貨管理", "應收帳款"],
      href: "#",
    },
    {
      title: "採購管理",
      items: ["供應商", "採購單", "進貨入庫", "MRP 需求"],
      href: "#",
    },
    {
      title: "庫存／倉儲",
      items: ["品項管理", "批號庫存", "出入庫", "效期提醒"],
      href: "/items",
    },
    {
      title: "生產管理",
      items: ["BOM 表", "主生產計劃", "生產工單", "品質管理"],
      href: "#",
    },
    {
      title: "財務帳款",
      items: ["應收", "應付", "成本", "對帳"],
      href: "#",
    },
    {
      title: "報表中心",
      items: ["庫存報表", "銷售報表", "採購報表", "異動紀錄"],
      href: "#",
    },
    {
      title: "系統設定",
      items: ["基礎資料", "權限", "匯入匯出", "備份"],
      href: "#",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">總覽</p>
        <h1 className="page-title">營運儀表板</h1>
        <p className="mt-2 text-sm text-slate-500">今天的庫存狀態與待辦事項一目了然。</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="panel p-5">
            <div className={`mb-5 h-1.5 w-10 rounded-full tone-${stat.tone}`} />
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {stat.value}
              <span className="ml-2 text-sm font-medium text-slate-400">{stat.unit}</span>
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <article className="panel p-7">
          <p className="eyebrow">開始使用</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">先把庫存底層打穩</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
            品項、批號、效期與異動紀錄會被銷售、採購和生產共用。先建立這一層，後續單據流程就不用重複做資料。
          </p>
          <Link href="/items" className="primary-button mt-6 inline-flex">
            前往品項管理
            <span aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="panel p-7">
          <h2 className="font-bold text-slate-900">建置進度</h2>
          <ol className="mt-5 space-y-4 text-sm">
            <li className="progress-done">開發環境與資料庫</li>
            <li className="progress-current">品項管理</li>
            <li className="progress-pending">倉庫與入庫流程</li>
            <li className="progress-pending">庫存查詢與效期提醒</li>
          </ol>
        </article>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">目錄規劃</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">ERP 模組地圖</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {modules.map((module) => (
            <Link key={module.title} href={module.href} className="panel block p-5 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md">
              <h3 className="text-base font-bold text-slate-900">{module.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                {module.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-teal-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
