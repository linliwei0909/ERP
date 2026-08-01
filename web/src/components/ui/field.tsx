import {
  Children,
  cloneElement,
  useId,
  type AriaAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";
import { FieldError } from "./field-error";

type FieldControlProps = {
  id?: string;
  required?: boolean;
  "aria-required"?: AriaAttributes["aria-required"];
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
};

export type FieldProps = {
  children: ReactElement<FieldControlProps>;
  className?: string;
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
  required?: boolean;
};

function joinIds(...values: Array<string | undefined>): string | undefined {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

export function Field({
  children,
  className,
  description,
  error,
  label,
  required = false,
}: FieldProps) {
  const generatedId = useId().replaceAll(":", "");
  const control = Children.only(children);
  const controlId = control.props.id ?? `field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const errorId = hasError ? `${controlId}-error` : undefined;
  const isRequired = required || Boolean(control.props.required);
  const describedBy = joinIds(
    control.props["aria-describedby"],
    descriptionId,
    errorId,
  );

  const connectedControl = cloneElement(control, {
    id: controlId,
    required: isRequired || undefined,
    "aria-required": control.props["aria-required"] ?? (isRequired || undefined),
    "aria-invalid": hasError ? true : control.props["aria-invalid"],
    "aria-describedby": describedBy,
  });

  return (
    <div className={classNames(uiStyles.field, className)}>
      <label className={uiStyles.fieldLabel} htmlFor={controlId}>
        <span>{label}</span>
        {isRequired ? (
          <>
            <span className={uiStyles.requiredIndicator} aria-hidden="true">
              *
            </span>
            <span className="sr-only">（必填）</span>
          </>
        ) : null}
      </label>
      {connectedControl}
      {description ? (
        <p id={descriptionId} className={uiStyles.fieldDescription}>
          {description}
        </p>
      ) : null}
      {hasError ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
