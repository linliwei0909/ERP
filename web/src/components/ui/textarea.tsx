import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type TextareaProps = Omit<
  ComponentPropsWithoutRef<"textarea">,
  "className"
> & {
  className?: string;
  invalid?: boolean;
};

export function Textarea({
  "aria-invalid": ariaInvalid,
  className,
  invalid = false,
  ...props
}: TextareaProps) {
  return (
    <textarea
      {...props}
      className={classNames(uiStyles.control, uiStyles.textarea, className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
    />
  );
}
