import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  buttonClassName,
  type ButtonVariant,
  type ControlSize,
  uiStyles,
} from "./button-styles";
import { classNames } from "@/lib/ui/class-names";

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  pending?: boolean;
  pendingLabel?: ReactNode;
  size?: ControlSize;
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    "aria-busy": ariaBusy,
    children,
    className,
    disabled,
    pending = false,
    pendingLabel = "處理中",
    size = "medium",
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, className })}
      disabled={disabled || pending}
      aria-busy={pending ? true : ariaBusy}
    >
      <span
        className={classNames(
          uiStyles.buttonContent,
          pending && uiStyles.buttonContentHidden,
        )}
      >
        {children}
      </span>
      {pending ? (
        <span className={uiStyles.pendingLabel}>{pendingLabel}</span>
      ) : null}
    </button>
  );
});
