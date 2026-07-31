"use client";

import Link from "next/link";

export function ShellErrorState({
  title = "系統暫時無法載入",
  message = "請稍後重試；若問題持續發生，請將識別碼提供給系統管理員。",
  correlationId,
  retry,
}: {
  title?: string;
  message?: string;
  correlationId?: string;
  retry?: () => void;
}) {
  return (
    <section className="shell-inline-state" role="alert">
      <p className="shell-special-state-kicker">系統訊息</p>
      <h1>{title}</h1>
      <p>{message}</p>
      {correlationId ? (
        <p className="shell-correlation-id">識別碼：{correlationId}</p>
      ) : null}
      <div className="shell-state-actions">
        <button type="button" onClick={() => (retry ? retry() : location.reload())}>
          重試
        </button>
        <Link href="/">返回作業首頁</Link>
      </div>
    </section>
  );
}
