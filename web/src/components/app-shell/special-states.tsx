import Link from "next/link";

export function NoCompanyState({ username }: { username: string }) {
  return (
    <main className="shell-special-state">
      <section>
        <p className="shell-special-state-kicker">帳號：{username}</p>
        <h1>尚未取得公司權限</h1>
        <p>此帳號目前沒有可使用的公司，請聯絡管理員指派公司範圍。</p>
        <form method="post" action="/api/auth/logout">
          <button type="submit">登出</button>
        </form>
      </section>
    </main>
  );
}

export function NotFoundState() {
  return (
    <section className="shell-inline-state">
      <p className="shell-special-state-kicker">404</p>
      <h1>找不到此頁面</h1>
      <p>頁面可能不存在、已移動，或不屬於目前公司。</p>
      <Link href="/">返回作業首頁</Link>
    </section>
  );
}
