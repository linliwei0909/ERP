import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type FormActionsProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  align?: "start" | "end";
  destructive?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode | ReactNode[];
};

export function FormActions({
  align = "end",
  className,
  destructive,
  primary,
  secondary,
  ...props
}: FormActionsProps) {
  return (
    <div
      {...props}
      className={classNames(uiStyles.formActions, className)}
      data-align={align}
    >
      {destructive ? (
        <div className={uiStyles.formActionsDestructive}>{destructive}</div>
      ) : null}
      <div className={uiStyles.formActionsRegular}>
        {secondary}
        {primary}
      </div>
    </div>
  );
}
