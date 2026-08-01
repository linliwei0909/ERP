import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type TableAlignment = "left" | "center" | "right";

export function TableContainer({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={classNames(uiStyles.tableContainer, className)} />;
}

export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return <table {...props} className={classNames(uiStyles.table, className)} />;
}

export type TableCaptionProps = ComponentPropsWithoutRef<"caption"> & {
  visuallyHidden?: boolean;
};

export function TableCaption({
  className,
  visuallyHidden = true,
  ...props
}: TableCaptionProps) {
  return (
    <caption
      {...props}
      className={classNames(
        uiStyles.tableCaption,
        visuallyHidden && "sr-only",
        className,
      )}
    />
  );
}

export function TableHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<"thead">) {
  return <thead {...props} className={classNames(uiStyles.tableHeader, className)} />;
}

export function TableBody({
  className,
  ...props
}: ComponentPropsWithoutRef<"tbody">) {
  return <tbody {...props} className={classNames(uiStyles.tableBody, className)} />;
}

export function TableRow({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return <tr {...props} className={classNames(uiStyles.tableRow, className)} />;
}

type TableTextProps = {
  align?: TableAlignment;
  monospace?: boolean;
  numeric?: boolean;
};

export type TableHeadProps = ComponentPropsWithoutRef<"th"> & TableTextProps;

export function TableHead({
  align = "left",
  className,
  monospace = false,
  numeric = false,
  scope = "col",
  ...props
}: TableHeadProps) {
  return (
    <th
      {...props}
      scope={scope}
      className={classNames(
        uiStyles.tableHead,
        uiStyles[`align${align}`],
        monospace && uiStyles.monospace,
        numeric && uiStyles.numeric,
        className,
      )}
      data-align={align}
    />
  );
}

export type TableCellProps = ComponentPropsWithoutRef<"td"> & TableTextProps;

export function TableCell({
  align = "left",
  className,
  monospace = false,
  numeric = false,
  ...props
}: TableCellProps) {
  return (
    <td
      {...props}
      className={classNames(
        uiStyles.tableCell,
        uiStyles[`align${align}`],
        monospace && uiStyles.monospace,
        numeric && uiStyles.numeric,
        className,
      )}
      data-align={align}
    />
  );
}

export type TableEmptyRowProps = Omit<
  ComponentPropsWithoutRef<"td">,
  "colSpan"
> & {
  colSpan: number;
};

export function TableEmptyRow({
  children,
  className,
  colSpan,
  ...props
}: TableEmptyRowProps) {
  return (
    <TableRow>
      <td
        {...props}
        colSpan={colSpan}
        className={classNames(uiStyles.tableEmptyCell, className)}
      >
        {children}
      </td>
    </TableRow>
  );
}
