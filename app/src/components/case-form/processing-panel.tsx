"use client";

import { PROCESSING_STEP_1, PROCESSING_STEP_2 } from "@/lib/shared/strings/form";

export interface ProcessingPanelProps {
  step: 1 | 2;
}

/** Replaces the submit button while the case is processed (PRD AC-15). */
export function ProcessingPanel({ step }: ProcessingPanelProps) {
  return (
    <div aria-live="polite" className="rounded-lg border bg-card p-3 text-sm">
      <ol className="grid gap-1.5">
        <li
          data-status={step === 1 ? "current" : "done"}
          aria-current={step === 1 ? "step" : undefined}
          className={step === 1 ? "font-medium" : "text-muted-foreground line-through"}
        >
          {PROCESSING_STEP_1}
        </li>
        <li
          data-status={step === 2 ? "current" : "pending"}
          aria-current={step === 2 ? "step" : undefined}
          className={step === 2 ? "font-medium" : "text-muted-foreground"}
        >
          {PROCESSING_STEP_2}
        </li>
      </ol>
    </div>
  );
}
