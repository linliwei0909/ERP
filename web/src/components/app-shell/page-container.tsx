export function PageContainer({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "wide" | "narrow";
}) {
  return (
    <div className={`shell-page-container shell-page-container-${variant}`}>
      {children}
    </div>
  );
}
