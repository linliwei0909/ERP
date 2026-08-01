import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  buttonClassName,
  type ButtonVariant,
  type ControlSize,
} from "./button-styles";

export type LinkButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  "aria-disabled" | "children" | "className"
> & {
  "aria-disabled"?: never;
  children: ReactNode;
  className?: string;
  size?: ControlSize;
  variant?: ButtonVariant;
};

export function LinkButton({
  children,
  className,
  size = "medium",
  variant = "primary",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      {...props}
      className={buttonClassName({ variant, size, className })}
    >
      {children}
    </Link>
  );
}
