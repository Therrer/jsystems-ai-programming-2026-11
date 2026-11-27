"use client";

import { Button } from "@/components/ui/button";
import { COMPANY_NAME, PRODUCT_NAME } from "@/lib/shared/strings/common";

// PRD §9.1, ADR-003 §3.5. Text wordmark only: no logo file (PRD AC-45).
export function AppHeader({ onNewCase }: { onNewCase?: () => void }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 lg:pl-[51px]">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[18px] font-semibold leading-tight text-foreground">{PRODUCT_NAME}</span>
        <span className="truncate text-[13px] text-muted-foreground">{COMPANY_NAME}</span>
      </div>
      {onNewCase ? (
        <Button variant="secondary" onClick={onNewCase}>
          Nowa sprawa
        </Button>
      ) : null}
    </header>
  );
}
