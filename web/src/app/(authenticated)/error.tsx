"use client";

import { useEffect } from "react";
import { ShellErrorState } from "@/components/app-shell/shell-error-state";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Authenticated route rendering failed", error);
  }, [error]);

  return (
    <ShellErrorState
      correlationId={error.digest}
      retry={reset}
      title="頁面暫時無法載入"
    />
  );
}
