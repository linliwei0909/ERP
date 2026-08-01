import type { CSSProperties, ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type SkeletonVariant = "text" | "block" | "circle";
type SkeletonDimension = number | `${number}%`;

export type SkeletonProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "aria-label" | "children" | "role" | "style"
> & {
  height?: SkeletonDimension;
  lines?: number;
  variant?: SkeletonVariant;
  width?: SkeletonDimension;
};

export function Skeleton({
  className,
  height,
  lines = 1,
  variant = "text",
  width,
  ...props
}: SkeletonProps) {
  const lineCount = variant === "text" ? Math.min(Math.max(lines, 1), 5) : 1;
  const style: CSSProperties = {
    height: height ?? (variant === "block" ? 96 : variant === "circle" ? 40 : undefined),
    width: width ?? (variant === "circle" ? 40 : "100%"),
  };

  return (
    <div
      {...props}
      aria-hidden="true"
      className={classNames(uiStyles.skeletonGroup, className)}
      data-variant={variant}
    >
      {Array.from({ length: lineCount }, (_, index) => (
        <span
          key={index}
          className={classNames(
            uiStyles.skeleton,
            uiStyles[`skeleton${variant}`],
          )}
          style={style}
        />
      ))}
    </div>
  );
}
