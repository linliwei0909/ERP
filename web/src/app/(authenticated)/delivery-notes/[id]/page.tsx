import { notFound, redirect } from "next/navigation";
import { AuthorizationError, requirePermission } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { hasPermission } from "@/lib/auth/rbac";
import { SessionAuthenticationError } from "@/lib/auth/session";
import { mapDeliveryNoteDetail } from "@/lib/delivery-notes/api";
import type { DeliveryNoteDetailDto } from "@/lib/delivery-notes/api-types";
import { DeliveryNoteNotFoundError } from "@/lib/delivery-notes/errors";
import { getDeliveryNote } from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";
import { DeliveryNoteDetailView } from "../delivery-note-view";
import {
  DeliveryNotePrintActions,
  DeliveryNoteVoidAction,
} from "./delivery-note-actions";

export default async function DeliveryNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let context;
  try {
    context = await getPageRequestContext();
    requirePermission(context, "delivery_notes.read");
  } catch (error) {
    if (error instanceof SessionAuthenticationError) redirect("/login");
    if (error instanceof AuthorizationError) redirect("/access-denied");
    redirect("/login");
  }

  const { id } = await params;
  let note: DeliveryNoteDetailDto | undefined;
  try {
    const deliveryNote = await getDeliveryNote(prisma, {
      context,
      companyId: context.selectedCompany.id,
      deliveryNoteId: id,
    });
    note = mapDeliveryNoteDetail(deliveryNote);
  } catch (error) {
    if (error instanceof DeliveryNoteNotFoundError) notFound();
  }

  if (!note) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8">
          <h1 className="text-xl font-bold text-rose-900">
            銷貨單明細載入失敗
          </h1>
          <p className="mt-2 text-sm text-rose-800">
            請返回清單後重試；若問題持續，請聯絡系統管理員。
          </p>
        </div>
      </main>
    );
  }

  const canVoid =
    note.status === "ACTIVE" &&
    hasPermission(
      context.roleCodes,
      "delivery_notes.admin_void",
    );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
      <DeliveryNoteDetailView
        note={note}
        actions={
          <>
            <DeliveryNotePrintActions
              deliveryNoteId={note.id}
              capabilities={note.printCapabilities}
            />
            {canVoid ? (
              <DeliveryNoteVoidAction deliveryNoteId={note.id} />
            ) : null}
          </>
        }
      />
    </main>
  );
}
