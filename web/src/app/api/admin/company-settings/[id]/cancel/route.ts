import { z } from "zod";
import type { NextRequest } from "next/server";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { assertSameOrigin } from "@/lib/auth/route-security";
import {
  companySettingApiError,
  companySettingCancelSchema,
  requireIdempotencyKey,
} from "@/lib/company-settings/api";
import { cancelFutureSettingVersion } from "@/lib/company-settings/service";
import { jsonResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await getApiRequestContext(request);
    const id = z.string().uuid().parse((await params).id);
    const body = companySettingCancelSchema.parse(await request.json());
    const result = await cancelFutureSettingVersion(prisma, {
      context,
      id,
      companyId: body.companyId,
      settingKey: body.settingKey,
      idempotencyKey: requireIdempotencyKey(request),
    });

    return jsonResponse(result);
  } catch (error) {
    return companySettingApiError(error);
  }
}
