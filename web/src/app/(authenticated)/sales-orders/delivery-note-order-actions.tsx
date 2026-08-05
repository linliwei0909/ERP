"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  LinkButton,
  Section,
  Textarea,
} from "@/components/ui";
import type { DeliveryNoteSummaryDto } from "@/lib/delivery-notes/api-types";
import {
  createDeliveryNote,
  DeliveryNoteClientError,
  rebuildDeliveryNote,
} from "@/lib/delivery-notes/client";

export function deliveryNoteOrderAction(input: {
  orderStatus: string;
  revisionNo: number;
  notes: DeliveryNoteSummaryDto[];
  canManage: boolean;
}): "create" | "rebuild" | null {
  if (!input.canManage || input.orderStatus !== "CONFIRMED") return null;
  const current = input.notes.find((note) => note.status !== "VOIDED");
  if (!current) return "create";
  return current.salesOrderRevisionNo < input.revisionNo
    ? "rebuild"
    : null;
}

export function DeliveryNoteOrderActions({
  salesOrderId,
  orderStatus,
  revisionNo,
  notes,
  canManage,
}: {
  salesOrderId: string;
  orderStatus: string;
  revisionNo: number;
  notes: DeliveryNoteSummaryDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const action = deliveryNoteOrderAction({
    orderStatus,
    revisionNo,
    notes,
    canManage,
  });
  const current = notes.find((note) => note.status !== "VOIDED");

  function openDialog() {
    setError(null);
    setReason("");
    setReasonError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setDialogOpen(false);
    setError(null);
    setReasonError(null);
  }

  async function submit() {
    if (!action || busy.current) return;
    const trimmedReason = reason.trim();
    if (action === "rebuild" && !trimmedReason) {
      setReasonError("重建理由必填");
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result =
        action === "create"
          ? await createDeliveryNote(salesOrderId, revisionNo)
          : await rebuildDeliveryNote(salesOrderId, revisionNo, trimmedReason);
      setDialogOpen(false);
      router.push(`/delivery-notes/${result.deliveryNote.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof DeliveryNoteClientError
          ? err.message
          : "銷貨單操作失敗，請稍後再試",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Card>
      <Section
        title="銷貨單"
        description="銷貨單只能由已確認訂單明確建立，不提供自由輸入表單。"
        actions={
          current ? (
            <LinkButton href={`/delivery-notes/${current.id}`}>
              查看目前銷貨單
            </LinkButton>
          ) : null
        }
      >
        {notes.length ? (
          <div className="flex flex-wrap gap-2">
            {notes.map((note) => (
              <LinkButton
                key={note.id}
                href={`/delivery-notes/${note.id}`}
                variant="secondary"
                size="small"
              >
                {note.deliveryNoteNumber}－
                {note.status === "VOIDED" ? "已作廢" : "有效"}
              </LinkButton>
            ))}
          </div>
        ) : (
          <p className={pageStyles.tableSubtext}>目前尚無銷貨單。</p>
        )}

        {action ? (
          <div className="mt-4">
            <Button type="button" disabled={pending} onClick={openDialog}>
              {action === "create" ? "建立銷貨單" : "重建銷貨單"}
            </Button>
          </div>
        ) : null}

        {!canManage ? (
          <p className={pageStyles.tableSubtext}>
            目前帳號只有檢視權限，無法建立或重建銷貨單。
          </p>
        ) : null}
      </Section>

      <ConfirmDialog
        open={dialogOpen}
        title={action === "create" ? "確認建立銷貨單" : "確認重建銷貨單"}
        description={
          action === "create"
            ? "系統會依目前訂單內容建立一張新的銷貨單。"
            : "舊銷貨單將依既有 atomic rebuild 流程作廢，系統會建立一張 replacement 銷貨單；不支援分批出貨。"
        }
        confirmLabel={action === "create" ? "建立銷貨單" : "重建銷貨單"}
        pending={pending}
        onCancel={closeDialog}
        onConfirm={() => void submit()}
      >
        {error ? (
          <Alert tone="danger" title="操作失敗">
            {error}
          </Alert>
        ) : null}
        {action === "rebuild" ? (
          <Field label="重建原因" error={reasonError} required>
            <Textarea
              value={reason}
              disabled={pending}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}
