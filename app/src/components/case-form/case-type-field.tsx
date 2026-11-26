"use client";

import type { Ref } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CASE_TYPE_LABELS } from "@/lib/shared/strings/common";
import { CASE_TYPE_GROUP_LABEL } from "@/lib/shared/strings/form";
import type { CaseType } from "@/lib/shared/schemas/enums";

export interface CaseTypeFieldProps {
  idBase: string;
  errorId: string;
  error?: string;
  value: CaseType | null;
  disabled: boolean;
  firstItemRef?: Ref<HTMLButtonElement>;
  onChange: (value: CaseType) => void;
  onBlur: () => void;
}

const ITEMS: CaseType[] = ["complaint", "return"];

/** Case type radios (PRD AC-01, AC-02): nothing is preselected. */
export function CaseTypeField({
  idBase,
  errorId,
  error,
  value,
  disabled,
  firstItemRef,
  onChange,
  onBlur,
}: CaseTypeFieldProps) {
  const labelId = `${idBase}-label`;
  return (
    <div className="grid gap-2">
      <span id={labelId} className="text-sm leading-none font-medium">
        {CASE_TYPE_GROUP_LABEL}
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value ?? ""}
        disabled={disabled}
        onValueChange={(next) => onChange(next as CaseType)}
        onBlur={(event) => {
          // Moving between radios keeps focus in the group: validate only when it leaves.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur();
        }}
        className="flex flex-wrap gap-4"
      >
        {ITEMS.map((item, index) => {
          const itemId = `${idBase}-${item}`;
          return (
            <div key={item} className="flex items-center gap-2">
              <RadioGroupItem
                id={itemId}
                value={item}
                ref={index === 0 ? firstItemRef : undefined}
              />
              <Label htmlFor={itemId}>{CASE_TYPE_LABELS[item]}</Label>
            </div>
          );
        })}
      </RadioGroup>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
