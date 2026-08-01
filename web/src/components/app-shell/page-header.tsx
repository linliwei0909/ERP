import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { PageContainerVariant } from "@/components/app-shell/page-container";
import { classNames } from "@/lib/ui/class-names";

export type PageHeaderProps = Omit<ComponentPropsWithoutRef<"header">, "title"> & {
  actions?: ReactNode;
  containerVariant?: PageContainerVariant;
  context?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
  // P4.2 compatibility slots. New integrations should prefer actions.
  status?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  overflowActions?: ReactNode;
  metadata?: Array<{ label: string; value: ReactNode }>;
};

export function PageHeader({
  actions,
  className,
  containerVariant,
  context,
  title,
  description,
  status,
  primaryAction,
  secondaryActions,
  overflowActions,
  metadata,
  ...props
}: PageHeaderProps) {
  const legacyActions = primaryAction || secondaryActions || overflowActions;
  return (
    <header
      {...props}
      className={classNames("shell-page-header", className)}
      data-page-container-variant={containerVariant}
    >
      <div className="shell-page-heading">
        {context ? <p className="shell-page-eyebrow">{context}</p> : null}
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
      {actions || legacyActions ? (
        <div className="shell-page-actions">
          {actions ?? (
            <>
              {secondaryActions}
              {primaryAction}
              {overflowActions}
            </>
          )}
        </div>
      ) : null}
    </header>
  );
}
