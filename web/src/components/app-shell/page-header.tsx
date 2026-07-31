export type PageHeaderProps = {
  title: string;
  description?: string;
  status?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  overflowActions?: React.ReactNode;
  metadata?: Array<{ label: string; value: React.ReactNode }>;
};

export function PageHeader({
  title,
  description,
  status,
  primaryAction,
  secondaryActions,
  overflowActions,
  metadata,
}: PageHeaderProps) {
  return (
    <header className="shell-page-header">
      <div className="shell-page-heading">
        <div className="shell-page-title-row">
          <h1>{title}</h1>
          {status}
        </div>
        {description ? <p>{description}</p> : null}
        {metadata?.length ? (
          <dl>
            {metadata.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {primaryAction || secondaryActions || overflowActions ? (
        <div className="shell-page-actions">
          {secondaryActions}
          {primaryAction}
          {overflowActions}
        </div>
      ) : null}
    </header>
  );
}
