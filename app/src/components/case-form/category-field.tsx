"use client";

import { useRef, type Ref } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/shared/strings/common";
import { CATEGORY_LABEL, CATEGORY_PLACEHOLDER } from "@/lib/shared/strings/form";
import { CATEGORIES, type Category } from "@/lib/shared/schemas/enums";

export interface CategoryFieldProps {
  id: string;
  errorId: string;
  error?: string;
  value: Category | null;
  disabled: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  onChange: (value: Category) => void;
  onBlur: () => void;
}

/** Device category select (PRD AC-02, AC-03): options in AC-03 order, nothing preselected. */
export function CategoryField({
  id,
  errorId,
  error,
  value,
  disabled,
  triggerRef,
  onChange,
  onBlur,
}: CategoryFieldProps) {
  // The list is open while focus sits in the portalled content: do not validate then.
  const openRef = useRef(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{CATEGORY_LABEL}</Label>
      <Select
        value={value ?? ""}
        disabled={disabled}
        onOpenChange={(open) => {
          openRef.current = open;
        }}
        onValueChange={(next) => onChange(next as Category)}
      >
        <SelectTrigger
          id={id}
          ref={triggerRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          className="w-full"
          onBlur={() => {
            if (!openRef.current) onBlur();
          }}
        >
          <SelectValue placeholder={CATEGORY_PLACEHOLDER} />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
