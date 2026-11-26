"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NEW_CASE_BUTTON } from "@/lib/shared/strings/chat";
import { API_ERROR_MESSAGES } from "@/lib/shared/strings/common";

export function SessionExpiredAlert({ onNewCase }: { onNewCase: () => void }) {
  return (
    <Alert role="alert">
      <AlertDescription className="flex flex-col gap-3">
        <span>{API_ERROR_MESSAGES.CASE_NOT_FOUND}</span>
        <Button type="button" onClick={onNewCase} className="self-start">
          {NEW_CASE_BUTTON}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
