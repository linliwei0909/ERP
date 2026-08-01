import type {
  ButtonHTMLAttributes,
  ReactElement,
  SVGProps,
} from "react";
import {
  buttonClassName,
  type ButtonVariant,
  type ControlSize,
  uiStyles,
} from "./button-styles";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  accessibleName: string;
  icon: ReactElement<SVGProps<SVGSVGElement>>;
  pending?: boolean;
  pendingLabel?: string;
  size?: ControlSize;
  variant?: ButtonVariant;
};

export function IconButton({
  "aria-busy": ariaBusy,
  accessibleName,
  className,
  disabled,
  icon,
  pending = false,
  pendingLabel = "處理中",
  size = "medium",
  type = "button",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={buttonClassName({
        variant,
        size,
        iconOnly: true,
        className,
      })}
      disabled={disabled || pending}
      aria-busy={pending ? true : ariaBusy}
      aria-label={pending ? pendingLabel : accessibleName}
    >
      <span className={uiStyles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
