export default function AuthenticatedLoading() {
  return (
    <section
      className="shell-loading-state"
      role="status"
      aria-label="正在載入頁面"
    >
      <span className="sr-only">正在載入頁面</span>
      <div className="shell-loading-line shell-loading-line-short" />
      <div className="shell-loading-card" />
      <div className="shell-loading-card" />
    </section>
  );
}
