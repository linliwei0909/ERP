import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type LoadingStateProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "role"
> & {
  children?: ReactNode;
  label?: string;
};

export function LoadingState({
  "aria-live": ariaLive = "polite",
  children,
  className,
  label = "載入中",
  ...props
}: LoadingStateProps) {
  return (
    <div
      {...props}
      role="status"
      aria-live={ariaLive}
      className={classNames(uiStyles.loadingState, className)}
    >
      <span className={uiStyles.loadingIndicator} aria-hidden="true" />
      <span className={uiStyles.loadingLabel}>{label}</span>
      {children ? <div className={uiStyles.loadingContent}>{children}</div> : null}
    </div>
  );
}
