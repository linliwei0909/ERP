import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusBadgeProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children"
> & {
  label: string;
  tone?: StatusTone;
};

export function StatusBadge({
  className,
  label,
  tone = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={classNames(
        uiStyles.statusBadge,
        uiStyles[`status${tone}`],
        className,
      )}
      data-tone={tone}
    >
      <span className={uiStyles.statusDot} aria-hidden="true" />
      {label}
    </span>
  );
}
