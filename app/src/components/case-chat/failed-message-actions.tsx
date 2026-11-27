"use client";

import { Button } from "@/components/ui/button";
import { FAILED_MESSAGE, RETRY_BUTTON } from "@/lib/shared/strings/chat";

export function FailedMessageActions({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-destructive">
      <span>{FAILED_MESSAGE}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {RETRY_BUTTON}
      </Button>
    </div>
  );
}
