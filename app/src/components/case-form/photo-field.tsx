"use client";

import { useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FieldErrors, FlowAction } from "@/lib/client/case-flow";
import { validateImageFile } from "@/lib/shared/schemas/case-form";
import {
  PHOTO_CHANGE_BUTTON,
  PHOTO_FORMATS_HINT,
  PHOTO_LABEL,
  PHOTO_PICK_BUTTON,
  PHOTO_PREVIEW_ALT,
  PHOTO_REMOVE_BUTTON,
} from "@/lib/shared/strings/form";

export interface PhotoFieldProps {
  id: string;
  errorId: string;
  file: File | null;
  previewUrl: string | null;
  fieldErrors: FieldErrors;
  error?: string;
  hint: string;
  disabled: boolean;
  inputRef?: (element: HTMLInputElement | null) => void;
  dispatch: (action: FlowAction) => void;
  onBlur: () => void;
}

/**
 * Device photo (PRD AC-11 – AC-13). The file input is visually hidden but stays labelled.
 * No `capture` attribute: the browser may offer the camera or the file picker.
 */
export function PhotoField({
  id,
  errorId,
  file,
  previewUrl,
  fieldErrors,
  error,
  hint,
  disabled,
  inputRef,
  dispatch,
  onBlur,
}: PhotoFieldProps) {
  const inputElement = useRef<HTMLInputElement | null>(null);
  const hintId = `${id}-hint`;
  const formatsId = `${id}-formats`;

  function setInput(element: HTMLInputElement | null) {
    inputElement.current = element;
    inputRef?.(element);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    // Clear the input so picking the same file again still fires a change event.
    event.target.value = "";
    if (!selected) return;

    const code = validateImageFile(selected);
    if (code) {
      // Rejected: keep the previous file and show the reason.
      dispatch({ type: "SET_FIELD_ERRORS", fieldErrors: { ...fieldErrors, image: code } });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    dispatch({ type: "SET_FILE", file: selected, previewUrl: URL.createObjectURL(selected) });
  }

  function handleRemove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    dispatch({ type: "CLEAR_FILE" });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{PHOTO_LABEL}</Label>
      <input
        ref={setInput}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : `${hintId} ${formatsId}`}
        onChange={handleChange}
        onBlur={onBlur}
      />
      <p id={hintId} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <p id={formatsId} className="text-xs text-muted-foreground">
        {PHOTO_FORMATS_HINT}
      </p>

      {file && previewUrl ? (
        <div className="flex items-center gap-3">
          {/* Blob preview of a local file: next/image cannot optimise it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={PHOTO_PREVIEW_ALT} className="size-24 rounded-md border object-cover" />
          <div className="grid gap-2">
            <p className="text-sm break-all">{file.name}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => inputElement.current?.click()}
              >
                {PHOTO_CHANGE_BUTTON}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={handleRemove}>
                {PHOTO_REMOVE_BUTTON}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => inputElement.current?.click()}
          >
            {PHOTO_PICK_BUTTON}
          </Button>
        </div>
      )}

      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
