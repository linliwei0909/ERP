import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type FieldErrorProps = Omit<
  ComponentPropsWithoutRef<"p">,
  "children"
> & {
  children: ReactNode;
};

export function FieldError({ children, className, ...props }: FieldErrorProps) {
  return (
    <p {...props} className={classNames(uiStyles.fieldError, className)}>
      {children}
    </p>
  );
}
