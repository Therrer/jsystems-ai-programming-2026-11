"use client";

import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RETRY_BUTTON } from "@/lib/shared/strings/form";

export interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

/** Shown above the form after a failed submit (PRD AC-40). Takes focus when it appears. */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <Alert variant="destructive" tabIndex={-1} ref={ref} className="outline-none">
      <AlertDescription>
        <p>{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {RETRY_BUTTON}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
