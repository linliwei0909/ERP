"use client";

import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { acquireBodyScrollLock } from "@/lib/ui/body-scroll-lock";
import { classNames } from "@/lib/ui/class-names";
import { uiStyles } from "./button-styles";
import { CloseIcon } from "./icons";
import { IconButton } from "./icon-button";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0,
  );
}

function subscribeToClientMount() {
  return () => undefined;
}

export type DialogProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  description?: ReactNode;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  title: ReactNode;
};

export function Dialog({
  actions,
  children,
  className,
  closeLabel = "關閉對話框",
  description,
  dismissible = true,
  initialFocusRef,
  onOpenChange,
  open,
  pending = false,
  title,
}: DialogProps) {
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    () => true,
    () => false,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const generatedId = useId().replaceAll(":", "");
  const titleId = `dialog-${generatedId}-title`;
  const descriptionId = description ? `dialog-${generatedId}-description` : undefined;

  useEffect(() => {
    if (!mounted || !open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    const releaseBodyScrollLock = acquireBodyScrollLock();

    queueMicrotask(() => {
      if (!dialog.open) return;
      const explicitTarget = initialFocusRef?.current;
      const currentTarget =
        document.activeElement instanceof HTMLElement &&
        dialog.contains(document.activeElement)
          ? document.activeElement
          : null;
      const autoFocusTarget = dialog.querySelector<HTMLElement>("[autofocus]");
      const firstFocusable = getFocusableElements(dialog)[0];
      const target =
        explicitTarget && dialog.contains(explicitTarget)
          ? explicitTarget
          : autoFocusTarget ?? currentTarget ?? firstFocusable ?? dialog;
      target.focus();
    });

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      releaseBodyScrollLock();
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      queueMicrotask(() => {
        if (returnTarget?.isConnected) {
          returnTarget.focus();
        }
      });
    };
  }, [initialFocusRef, mounted, open]);

  function requestClose() {
    if (!dismissible || pending) return;
    onOpenChange(false);
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    requestClose();
  }

  function handleMouseDown(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-busy={pending || undefined}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className={classNames(uiStyles.dialog, className)}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      tabIndex={-1}
    >
      <div className={uiStyles.dialogHeader}>
        <div>
          <h2 id={titleId} className={uiStyles.dialogTitle}>
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className={uiStyles.dialogDescription}>
              {description}
            </div>
          ) : null}
        </div>
        <IconButton
          accessibleName={closeLabel}
          disabled={pending || !dismissible}
          icon={<CloseIcon />}
          onClick={requestClose}
          size="small"
        />
      </div>
      <div className={uiStyles.dialogBody}>{children}</div>
      {actions ? <div className={uiStyles.dialogActions}>{actions}</div> : null}
    </dialog>,
    document.body,
  );
}
