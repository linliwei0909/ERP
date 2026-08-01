import type { AriaRole, ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";
import { CheckIcon, ErrorIcon, InfoIcon, WarningIcon } from "./icons";

export type AlertTone = "info" | "success" | "warning" | "danger";

export type AlertProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "role" | "title"
> & {
  actions?: ReactNode;
  children: ReactNode;
  icon?: ReactNode | false;
  role?: AriaRole;
  title?: ReactNode;
  tone?: AlertTone;
};

const defaultIcons = {
  info: <InfoIcon />,
  success: <CheckIcon />,
  warning: <WarningIcon />,
  danger: <ErrorIcon />,
} satisfies Record<AlertTone, ReactNode>;

const defaultRoles: Partial<Record<AlertTone, AriaRole>> = {
  success: "status",
  danger: "alert",
};

export function Alert({
  actions,
  children,
  className,
  icon,
  role,
  title,
  tone = "info",
  ...props
}: AlertProps) {
  const resolvedIcon = icon === undefined ? defaultIcons[tone] : icon;

  return (
    <div
      {...props}
      role={role ?? defaultRoles[tone]}
      className={classNames(uiStyles.alert, uiStyles[`alert${tone}`], className)}
      data-tone={tone}
    >
      {resolvedIcon ? (
        <span className={uiStyles.feedbackIcon} aria-hidden="true">
          {resolvedIcon}
        </span>
      ) : null}
      <div className={uiStyles.feedbackContent}>
        {title ? <div className={uiStyles.feedbackTitle}>{title}</div> : null}
        <div className={uiStyles.feedbackBody}>{children}</div>
        {actions ? <div className={uiStyles.feedbackActions}>{actions}</div> : null}
      </div>
    </div>
  );
}
