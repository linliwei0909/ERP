import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  companySettingApiError,
  companySettingWriteSchema,
  requireIdempotencyKey,
} from "@/lib/company-settings/api";
import {
  createFutureSettingVersion,
  getEffectiveCompanySetting,
  listCompanySettingHistory,
  parseDateOnly,
  requireAdminCompanySettingAccess,
} from "@/lib/company-settings/service";
import { assertCompanySettingKey } from "@/lib/company-settings/registry";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  companyId: z.string().uuid(),
  settingKey: z.string().min(1).max(100),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    const query = querySchema.parse({
      companyId: request.nextUrl.searchParams.get("companyId"),
      settingKey: request.nextUrl.searchParams.get("settingKey"),
      effectiveDate:
        request.nextUrl.searchParams.get("effectiveDate") ?? undefined,
    });
    assertCompanySettingKey(query.settingKey);

    if (query.effectiveDate) {
      await requireAdminCompanySettingAccess(
        prisma,
        context,
        query.companyId,
      );
      const setting = await getEffectiveCompanySetting(
        prisma,
        query.companyId,
        query.settingKey,
        parseDateOnly(query.effectiveDate),
      );
      return jsonResponse({
        companyId: query.companyId,
        settingKey: query.settingKey,
        settingValue: setting.settingValue,
        versionId: setting.id,
        effectiveFrom: setting.effectiveFrom.toISOString().slice(0, 10),
        effectiveDate: query.effectiveDate,
      });
    }

    const history = await listCompanySettingHistory(
      prisma,
      context,
      query.companyId,
      query.settingKey,
    );
    return jsonResponse({ history });
  } catch (error) {
    return companySettingApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const body = companySettingWriteSchema.parse(await request.json());
    const result = await createFutureSettingVersion(prisma, {
      context,
      companyId: body.companyId,
      settingKey: body.settingKey,
      settingValue: body.settingValue,
      effectiveFrom: parseDateOnly(body.effectiveFrom),
      idempotencyKey: requireIdempotencyKey(request),
    });

    return jsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return companySettingApiError(error);
  }
}
