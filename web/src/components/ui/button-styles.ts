import { classNames } from "@/lib/ui/class-names";
import styles from "./ui.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive";

export type ControlSize = "small" | "medium";

export function buttonClassName({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ControlSize;
  iconOnly?: boolean;
  className?: string;
}): string {
  return classNames(
    styles.button,
    styles[variant],
    styles[size],
    iconOnly && styles.iconButton,
    className,
  );
}

export { styles as uiStyles };
