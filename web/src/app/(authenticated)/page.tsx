import { PageHeader } from "@/components/app-shell/page-header";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <PageHeader
        title="作業首頁"
        description="請從固定導覽選擇要進行的作業。"
      />
      {error === "company_access_denied" ? (
        <p className="shell-notice shell-notice-error" role="alert">
          公司切換失敗。請確認公司權限後再試一次。
        </p>
      ) : null}
      <section className="shell-home-card">
        <h2>開始作業</h2>
        <p>
          固定導覽僅顯示目前帳號可使用的功能；直接開啟頁面時仍會由伺服器重新驗證權限。
        </p>
      </section>
    </main>
  );
}
