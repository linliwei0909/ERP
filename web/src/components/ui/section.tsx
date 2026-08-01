import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";

export type SectionHeading = "h2" | "h3" | "h4";

export type SectionProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "title"
> & {
  actions?: ReactNode;
  description?: ReactNode;
  divider?: boolean;
  headingAs?: SectionHeading;
  title: ReactNode;
};

export function Section({
  actions,
  children,
  className,
  description,
  divider = false,
  headingAs = "h2",
  title,
  ...props
}: SectionProps) {
  const Heading = headingAs as ElementType;
  return (
    <section
      {...props}
      className={classNames(uiStyles.section, divider && uiStyles.sectionDivider, className)}
    >
      <div className={uiStyles.sectionHeader}>
        <div>
          <Heading className={uiStyles.sectionTitle}>{title}</Heading>
          {description ? (
            <div className={uiStyles.sectionDescription}>{description}</div>
          ) : null}
        </div>
        {actions ? <div className={uiStyles.sectionActions}>{actions}</div> : null}
      </div>
      <div className={uiStyles.sectionContent}>{children}</div>
    </section>
  );
}
