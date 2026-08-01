import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert } from "@/components/ui";
import { AuthorizationError, requirePermission } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { SessionAuthenticationError } from "@/lib/auth/session";
import {
  deliveryNoteListQuerySchema,
  mapDeliveryNoteSummary,
} from "@/lib/delivery-notes/api";
import { listDeliveryNotes } from "@/lib/delivery-notes/service";
import { prisma } from "@/lib/prisma";
import {
  DeliveryNoteListView,
  type DeliveryNoteListItemView,
} from "./delivery-note-view";

type DeliveryNoteSearchParams = {
  status?: string;
  deliveryNoteNumber?: string;
  customerKeyword?: string;
  deliveryNoteDateFrom?: string;
  deliveryNoteDateTo?: string;
  page?: string;
};

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<DeliveryNoteSearchParams>;
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

  const query = await searchParams;
  const parsed = deliveryNoteListQuerySchema.safeParse({
    status: query.status ?? "ALL",
    deliveryNoteNumber: query.deliveryNoteNumber || undefined,
    customerKeyword: query.customerKeyword || undefined,
    deliveryNoteDateFrom: query.deliveryNoteDateFrom || undefined,
    deliveryNoteDateTo: query.deliveryNoteDateTo || undefined,
    page: query.page ?? "1",
    pageSize: "20",
  });

  if (!parsed.success) {
    return (
      <main className={pageStyles.pageStack}>
        <PageHeader containerVariant="wide" context="銷貨作業" title="銷貨單清單" />
        <Alert tone="danger" title="篩選條件不正確">
            請確認日期範圍、狀態及頁碼後重新查詢。
        </Alert>
      </main>
    );
  }

  let viewData:
    | {
        items: DeliveryNoteListItemView[];
        pagination: {
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
      }
    | undefined;
  try {
    const result = await listDeliveryNotes(prisma, {
      context,
      companyId: context.selectedCompany.id,
      filters: parsed.data,
    });
    const ids = result.deliveryNotes.map((note) => note.id);
    const creators = ids.length
      ? await prisma.deliveryNote.findMany({
          where: {
            companyId: context.selectedCompany.id,
            id: { in: ids },
          },
          select: {
            id: true,
            createdBy: { select: { id: true, username: true } },
          },
        })
      : [];
    const creatorById = new Map(
      creators.map((record) => [record.id, record.createdBy]),
    );
    const items: DeliveryNoteListItemView[] = result.deliveryNotes.map(
      (note) => {
        const createdBy = creatorById.get(note.id);
        if (!createdBy) {
          throw new Error("銷貨單建立者資料不完整");
        }
        return {
          ...mapDeliveryNoteSummary(note),
          createdBy,
        };
      },
    );
    viewData = { items, pagination: result.pagination };
  } catch {
    viewData = undefined;
  }

  if (!viewData) {
    return (
      <main className={pageStyles.pageStack}>
        <PageHeader containerVariant="wide" context="銷貨作業" title="銷貨單清單" />
        <Alert tone="danger" title="銷貨單清單載入失敗">
            請稍後重新整理頁面；若問題持續，請聯絡系統管理員。
        </Alert>
      </main>
    );
  }

  return (
    <main className={pageStyles.pageStack}>
      <DeliveryNoteListView
        company={context.selectedCompany}
        items={viewData.items}
        {...viewData.pagination}
        query={{
          status: parsed.data.status,
          deliveryNoteNumber: parsed.data.deliveryNoteNumber ?? "",
          customerKeyword: parsed.data.customerKeyword ?? "",
          deliveryNoteDateFrom:
            parsed.data.deliveryNoteDateFrom ?? "",
          deliveryNoteDateTo: parsed.data.deliveryNoteDateTo ?? "",
        }}
      />
    </main>
  );
}
