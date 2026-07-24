import type { NextRequest } from "next/server";
import { AuthorizationError } from "@/lib/auth/authorization";

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");

  if (origin && origin !== request.nextUrl.origin) {
    throw new AuthorizationError();
  }
}

export function formString(
  formData: FormData,
  key: string,
): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formRawString(
  formData: FormData,
  key: string,
): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function formStrings(
  formData: FormData,
  key: string,
): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}
