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
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { PageHeader } from "@/components/app-shell/page-header";
import { Alert, Card, LinkButton, Section } from "@/components/ui";
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
      <main className={pageStyles.pageStack}>
        <PageHeader
          containerVariant="wide"
          context="銷貨作業"
          title="銷貨單明細"
          actions={
            <LinkButton href="/delivery-notes" variant="secondary">
              返回清單
            </LinkButton>
          }
        />
        <Alert tone="danger" title="銷貨單明細載入失敗">
          請返回清單後重試；若問題持續，請聯絡系統管理員。
        </Alert>
      </main>
    );
  }

  const canVoid =
    note.status === "ACTIVE" &&
    hasPermission(context.roleCodes, "delivery_notes.admin_void");

  return (
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="銷貨作業"
        title="銷貨單明細"
        actions={
          <LinkButton href="/delivery-notes" variant="secondary">
            返回清單
          </LinkButton>
        }
      />
      <Card>
        <Section title="銷貨單操作">
          <DeliveryNotePrintActions
            deliveryNoteId={note.id}
            capabilities={note.printCapabilities}
          />
          {canVoid ? <DeliveryNoteVoidAction deliveryNoteId={note.id} /> : null}
        </Section>
      </Card>
      <DeliveryNoteDetailView note={note} />
    </main>
  );
}
