export type ErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function jsonResponse<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export function errorResponse(input: {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}): Response {
  const payload: ErrorPayload = {
    error: {
      code: input.code,
      message: input.message,
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  };

  return jsonResponse(payload, { status: input.status });
}
