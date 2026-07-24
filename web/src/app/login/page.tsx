export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-teal-700">Ragic 本地端系統</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">登入</h1>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            帳號或密碼不正確，或目前無法登入。
          </p>
        ) : null}
        <form className="mt-6 space-y-4" method="post" action="/api/auth/login">
          <label className="block text-sm font-medium text-slate-700">
            帳號
            <input
              name="username"
              required
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            密碼
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button className="w-full rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800">
            登入
          </button>
        </form>
      </section>
    </main>
  );
}
