import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

const validRequestId = /^[A-Za-z0-9._:-]{1,100}$/;

export function createRequestId(candidate?: string | null): string {
  return candidate && validRequestId.test(candidate)
    ? candidate
    : randomUUID();
}
