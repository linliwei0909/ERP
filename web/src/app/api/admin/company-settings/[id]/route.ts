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
  parseDateOnly,
  updateFutureSettingVersion,
} from "@/lib/company-settings/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const id = z.string().uuid().parse((await params).id);
    const body = companySettingWriteSchema.parse(await request.json());
    const result = await updateFutureSettingVersion(prisma, {
      context,
      id,
      companyId: body.companyId,
      settingKey: body.settingKey,
      settingValue: body.settingValue,
      effectiveFrom: parseDateOnly(body.effectiveFrom),
      idempotencyKey: requireIdempotencyKey(request),
    });

    return jsonResponse(result);
  } catch (error) {
    return companySettingApiError(error);
  }
}
