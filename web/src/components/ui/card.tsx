import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type CardVariant = "default" | "subtle";
export type CardPadding = "small" | "medium";

export type CardProps = ComponentPropsWithoutRef<"div"> & {
  padding?: CardPadding;
  variant?: CardVariant;
};

export function Card({
  className,
  padding = "medium",
  variant = "default",
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={classNames(
        uiStyles.card,
        uiStyles[`card${variant}`],
        uiStyles[`cardPadding${padding}`],
        className,
      )}
      data-padding={padding}
      data-variant={variant}
    />
  );
}
