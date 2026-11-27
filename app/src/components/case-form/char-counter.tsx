"use client";

import { codePointLength } from "@/lib/shared/schemas/case-form";

export interface CharCounterProps {
  id: string;
  value: string;
  max: number;
}

/** "n / max" under the description, counted in code points (PRD AC-08). */
export function CharCounter({ id, value, max }: CharCounterProps) {
  return (
    <p id={id} className="text-right text-xs text-muted-foreground">
      {`${codePointLength(value)} / ${max}`}
    </p>
  );
}
