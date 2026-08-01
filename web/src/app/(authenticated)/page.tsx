import { PageHeader } from "@/components/app-shell/page-header";
import { Alert, Section } from "@/components/ui";
import pageStyles from "@/components/app-shell/page-contract.module.css";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="standard"
        context="工作區"
        title="作業首頁"
        description="請從固定導覽選擇要進行的作業。"
      />
      {error === "company_access_denied" ? (
        <Alert tone="danger" title="公司切換失敗">
          請確認公司權限後再試一次。
        </Alert>
      ) : null}
      <Section title="開始作業">
        <p>
          固定導覽僅顯示目前帳號可使用的功能；直接開啟頁面時仍會由伺服器重新驗證權限。
        </p>
      </Section>
    </main>
  );
}
