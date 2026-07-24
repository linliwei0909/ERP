import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getApiRequestContext } from "@/lib/auth/request-context";
import { CompanyAccessError } from "@/lib/auth/company-scope";

export async function GET(request: NextRequest) {
  try {
    const context = await getApiRequestContext(request);
    return jsonResponse(context);
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return errorResponse({
        code: error.code,
        message: error.message,
        status: 403,
      });
    }
    return errorResponse({
      code: "AUTHENTICATION_REQUIRED",
      message: "需要登入",
      status: 401,
    });
  }
}
