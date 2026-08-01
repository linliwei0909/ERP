import type { SVGProps } from "react";

export type SvgIconProps = Omit<SVGProps<SVGSVGElement>, "children">;

const sharedProps = {
  "aria-hidden": true,
  fill: "none",
  focusable: false,
  height: 18,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
  width: 18,
} as const;

export function MenuIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function SearchIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function ChevronLeftIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function InfoIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function CheckIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

export function WarningIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <path d="M10.3 4.2 3.1 17a2 2 0 0 0 1.7 3h14.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function ErrorIcon(props: SvgIconProps) {
  return (
    <svg {...props} {...sharedProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}
