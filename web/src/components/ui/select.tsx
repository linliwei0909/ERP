import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type SelectProps = Omit<
  ComponentPropsWithoutRef<"select">,
  "className"
> & {
  className?: string;
  invalid?: boolean;
};

export function Select({
  "aria-invalid": ariaInvalid,
  children,
  className,
  invalid = false,
  ...props
}: SelectProps) {
  return (
    <select
      {...props}
      className={classNames(uiStyles.control, uiStyles.select, className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
    >
      {children}
    </select>
  );
}
