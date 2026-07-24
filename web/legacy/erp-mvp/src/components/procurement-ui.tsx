import Link from "next/link";

export function FlashMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {error ?? success}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  backHref,
  actionHref,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  backHref?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <header className="page-header mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {backHref ? <Link href={backHref} className="back-link mb-3 inline-flex items-center gap-1.5 text-sm font-semibold">← 返回清單</Link> : null}
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actionHref && actionLabel ? <Link href={actionHref} className="primary-button inline-flex"><span aria-hidden="true">＋</span>{actionLabel}</Link> : null}
    </header>
  );
}

export function DetailSection({ title, tone = "teal", children }: { title: string; tone?: "teal" | "blue" | "amber" | "violet"; children: React.ReactNode }) {
  return (
    <section className={`panel detail-section detail-section-${tone} mb-6 overflow-hidden`}>
      <h2 className="detail-section-title">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>;
}

export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-3">
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export function StatusPill({ children }: { children: React.ReactNode }) {
  return <span className="status-pill">{children}</span>;
}

export function EmptyRow({ colSpan, message = "目前沒有資料" }: { colSpan: number; message?: string }) {
  return <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-500">{message}</td></tr>;
}
