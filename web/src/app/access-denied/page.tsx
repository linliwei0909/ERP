export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">尚未取得公司權限</h1>
        <p className="mt-3 text-slate-600">
          此帳號目前沒有可使用的公司，請聯絡管理員指派公司範圍。
        </p>
        <form method="post" action="/api/auth/logout" className="mt-6">
          <button className="rounded-lg border border-slate-300 px-4 py-2">
            登出
          </button>
        </form>
      </section>
    </main>
  );
}
