"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Decision } from "@/lib/shared/schemas/ai";
import { BASIS_PREFIX, UPDATED_DECISION_HEADING } from "@/lib/shared/strings/chat";
import { OUTCOME_LABELS, REMEDY_LABELS } from "@/lib/shared/strings/common";
import { cn } from "@/lib/utils";

type Outcome = Decision["outcome"];

// Tint and left border per outcome; the icon and label always carry the meaning too (never color alone).
const OUTCOME_STYLE: Record<Outcome, { className: string; Icon: typeof CheckCircle2 }> = {
  ACCEPT: {
    className: "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    Icon: CheckCircle2,
  },
  REJECT: {
    className: "border-red-600 bg-red-50 dark:bg-red-950/40",
    Icon: XCircle,
  },
  MANUAL_REVIEW: {
    className: "border-amber-500 bg-amber-50 dark:bg-amber-950/40",
    Icon: AlertTriangle,
  },
};

export function DecisionBlock({ decision, variant }: { decision: Decision; variant: "initial" | "updated" }) {
  const { className, Icon } = OUTCOME_STYLE[decision.outcome];

  return (
    <div
      data-testid="decision-block"
      data-outcome={decision.outcome}
      className={cn("flex flex-col gap-2 rounded-md border-l-4 px-3 py-2 text-sm", className)}
    >
      {variant === "updated" ? (
        <p className="text-xs font-medium text-muted-foreground">{UPDATED_DECISION_HEADING}</p>
      ) : null}
      <div className="flex items-center gap-2 font-medium">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span>{OUTCOME_LABELS[decision.outcome]}</span>
      </div>
      {decision.remedy !== null ? <p>{REMEDY_LABELS[decision.remedy]}</p> : null}
      <p className="text-xs text-muted-foreground">{`${BASIS_PREFIX}${decision.citedRuleIds.join(", ")}`}</p>
    </div>
  );
}
