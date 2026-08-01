import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "@/lib/ui/class-names";
import { buttonClassName, uiStyles } from "./button-styles";
import { LinkButton } from "./link-button";

export type PaginationProps = Omit<
  ComponentPropsWithoutRef<"nav">,
  "children"
> & {
  currentPage: number;
  label?: string;
  nextHref?: string;
  previousHref?: string;
  totalPages: number;
};

export function Pagination({
  className,
  currentPage,
  label = "分頁",
  nextHref,
  previousHref,
  totalPages,
  ...props
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const hasPrevious = safeCurrentPage > 1 && Boolean(previousHref);
  const hasNext = safeCurrentPage < safeTotalPages && Boolean(nextHref);

  return (
    <nav
      {...props}
      aria-label={label}
      className={classNames(uiStyles.pagination, className)}
    >
      {hasPrevious ? (
        <LinkButton href={previousHref!} variant="secondary" size="small">
          上一頁
        </LinkButton>
      ) : (
        <span
          aria-disabled="true"
          className={classNames(
            buttonClassName({ variant: "secondary", size: "small" }),
            uiStyles.paginationDisabled,
          )}
        >
          上一頁
        </span>
      )}
      <span className={uiStyles.paginationCurrent} aria-current="page">
        第 {safeCurrentPage} / {safeTotalPages} 頁
      </span>
      {hasNext ? (
        <LinkButton href={nextHref!} variant="secondary" size="small">
          下一頁
        </LinkButton>
      ) : (
        <span
          aria-disabled="true"
          className={classNames(
            buttonClassName({ variant: "secondary", size: "small" }),
            uiStyles.paginationDisabled,
          )}
        >
          下一頁
        </span>
      )}
    </nav>
  );
}
