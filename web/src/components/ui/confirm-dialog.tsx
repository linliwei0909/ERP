"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { Button } from "./button";
import { uiStyles } from "./button-styles";
import { Dialog } from "./dialog";

export type ConfirmDialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  description: ReactNode;
  destructive?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  pending?: boolean;
  title: ReactNode;
};

export function ConfirmDialog({
  cancelLabel = "取消",
  children,
  confirmLabel,
  description,
  destructive = false,
  initialFocusRef,
  onCancel,
  onConfirm,
  open,
  pending = false,
  title,
}: ConfirmDialogProps) {
  const cancelFocusRef = useRef<HTMLButtonElement>(null);

  function confirm() {
    if (!pending) onConfirm();
  }

  return (
    <Dialog
      actions={
        <div className={uiStyles.confirmActions}>
          <Button
            disabled={pending}
            onClick={onCancel}
            ref={cancelFocusRef}
            variant="secondary"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={confirm}
            pending={pending}
            pendingLabel="處理中"
            variant={destructive ? "destructive" : "primary"}
          >
            {confirmLabel}
          </Button>
        </div>
      }
      description={description}
      dismissible={!pending}
      initialFocusRef={initialFocusRef ?? cancelFocusRef}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onCancel();
      }}
      open={open}
      pending={pending}
      title={title}
    >
      {children}
    </Dialog>
  );
}
