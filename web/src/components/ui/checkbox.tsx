import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

type CheckboxNativeProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "className" | "type"
> & {
  className?: string;
  invalid?: boolean;
};

export type CheckboxProps = CheckboxNativeProps &
  (
    | { label: ReactNode; "aria-label"?: string }
    | { label?: undefined; "aria-label": string }
  );

export function Checkbox({
  "aria-invalid": ariaInvalid,
  className,
  disabled,
  invalid = false,
  label,
  ...props
}: CheckboxProps) {
  const control = (
    <input
      {...props}
      type="checkbox"
      className={classNames(uiStyles.checkbox, className)}
      disabled={disabled}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
    />
  );

  if (label === undefined) {
    return control;
  }

  return (
    <label className={uiStyles.checkboxRow} data-disabled={disabled || undefined}>
      {control}
      <span>{label}</span>
    </label>
  );
}
