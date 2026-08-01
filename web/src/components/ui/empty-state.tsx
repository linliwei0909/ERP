import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type EmptyStateVariant = "no-data" | "no-results" | "permission-limited";

export type EmptyStateProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children" | "title"
> & {
  description?: ReactNode;
  icon?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  title: ReactNode;
  variant: EmptyStateVariant;
};

export function EmptyState({
  className,
  description,
  icon,
  primaryAction,
  secondaryAction,
  title,
  variant,
  ...props
}: EmptyStateProps) {
  return (
    <section
      {...props}
      className={classNames(uiStyles.emptyState, className)}
      data-variant={variant}
    >
      {icon ? (
        <span className={uiStyles.emptyStateIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h2 className={uiStyles.emptyStateTitle}>{title}</h2>
      {description ? (
        <div className={uiStyles.emptyStateDescription}>{description}</div>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className={uiStyles.emptyStateActions}>
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}
