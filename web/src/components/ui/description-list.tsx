import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type DescriptionColumns = 1 | 2 | 3 | 4;

export type DescriptionListProps = ComponentPropsWithoutRef<"dl"> & {
  columns?: DescriptionColumns;
};

export function DescriptionList({
  className,
  columns = 2,
  ...props
}: DescriptionListProps) {
  return (
    <dl
      {...props}
      className={classNames(
        uiStyles.descriptionList,
        uiStyles[`descriptionColumns${columns}`],
        className,
      )}
      data-columns={columns}
    />
  );
}

export function DescriptionItem({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={classNames(uiStyles.descriptionItem, className)} />;
}

export function DescriptionTerm({
  className,
  ...props
}: ComponentPropsWithoutRef<"dt">) {
  return <dt {...props} className={classNames(uiStyles.descriptionTerm, className)} />;
}

export function DescriptionDetails({
  className,
  ...props
}: ComponentPropsWithoutRef<"dd">) {
  return <dd {...props} className={classNames(uiStyles.descriptionDetails, className)} />;
}
