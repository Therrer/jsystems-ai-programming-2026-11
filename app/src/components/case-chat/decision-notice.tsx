"use client";

import { DECISION_NOTICE } from "@/lib/shared/strings/common";

export function DecisionNotice() {
  return (
    <p role="note" className="text-xs text-muted-foreground">
      {DECISION_NOTICE}
    </p>
  );
}
