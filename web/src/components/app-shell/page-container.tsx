import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";

export type PageContainerVariant = "standard" | "wide" | "full";
export type LegacyPageContainerVariant = "default" | "narrow";

export type PageContainerProps = ComponentPropsWithoutRef<"div"> & {
  variant?: PageContainerVariant | LegacyPageContainerVariant;
};

export function PageContainer({
  children,
  className,
  variant = "standard",
  ...props
}: PageContainerProps) {
  const normalizedVariant: PageContainerVariant =
    variant === "default" ? "wide" : variant === "narrow" ? "standard" : variant;
  const legacyVariant =
    variant === "default" || variant === "narrow" ? variant : undefined;

  return (
    <div
      {...props}
      className={classNames(
        "shell-page-container",
        `shell-page-container-${normalizedVariant}`,
        className,
      )}
      data-legacy-variant={legacyVariant}
      data-variant={normalizedVariant}
    >
      {children}
    </div>
  );
}
