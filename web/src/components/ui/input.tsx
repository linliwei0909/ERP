import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type InputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "className"
> & {
  className?: string;
  invalid?: boolean;
};

export function Input({
  "aria-invalid": ariaInvalid,
  className,
  invalid = false,
  ...props
}: InputProps) {
  return (
    <input
      {...props}
      className={classNames(uiStyles.control, className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
    />
  );
}
