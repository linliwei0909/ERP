import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";
import { ErrorIcon } from "./icons";

export type ErrorSummaryItem = {
  fieldId?: string;
  message: string;
};

export type ErrorSummaryProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "role" | "tabIndex" | "title"
> & {
  errors?: ErrorSummaryItem[];
  message?: ReactNode;
  title: ReactNode;
};

export function ErrorSummary({
  className,
  errors = [],
  message,
  title,
  ...props
}: ErrorSummaryProps) {
  return (
    <div
      {...props}
      role="alert"
      tabIndex={-1}
      className={classNames(uiStyles.errorSummary, className)}
    >
      <span className={uiStyles.feedbackIcon} aria-hidden="true">
        <ErrorIcon />
      </span>
      <div className={uiStyles.feedbackContent}>
        <h2 className={uiStyles.feedbackTitle}>{title}</h2>
        {message ? <div className={uiStyles.feedbackBody}>{message}</div> : null}
        {errors.length > 0 ? (
          <ul className={uiStyles.errorSummaryList}>
            {errors.map((item, index) => (
              <li key={`${item.fieldId ?? "general"}-${index}`}>
                {item.fieldId ? (
                  <a href={`#${item.fieldId}`}>{item.message}</a>
                ) : (
                  item.message
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
