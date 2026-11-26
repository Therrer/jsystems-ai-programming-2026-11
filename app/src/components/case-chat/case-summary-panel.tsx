"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { FormValues } from "@/lib/client/case-flow";
import { codePointLength } from "@/lib/shared/schemas/case-form";
import {
  CASE_SUMMARY_LABEL,
  CASE_TYPE_FIELD,
  CATEGORY_FIELD,
  DESCRIPTION_FIELD,
  MODEL_FIELD,
  PHOTO_FIELD,
  PHOTO_PREVIEW_ALT,
  PURCHASE_DATE_FIELD,
  SHOW_LESS,
  SHOW_MORE,
  ZOOM_PHOTO_BUTTON,
} from "@/lib/shared/strings/chat";
import { CASE_TYPE_LABELS, CATEGORY_LABELS } from "@/lib/shared/strings/common";
import { cn } from "@/lib/utils";

const DESCRIPTION_PREVIEW_LENGTH = 200;

/** "2026-11-21" -> "21.11.2026" (ISO date parts are validated upstream). */
function formatPurchaseDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function CaseSummaryPanel({ values, previewUrl }: { values: FormValues; previewUrl: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const characters = [...values.description];
  const isLong = codePointLength(values.description) > DESCRIPTION_PREVIEW_LENGTH;
  const shownDescription =
    isLong && !expanded ? characters.slice(0, DESCRIPTION_PREVIEW_LENGTH).join("") : values.description;

  const details = (
    <dl className="flex flex-col gap-3 text-sm">
      {values.caseType ? (
        <div>
          <dt className="text-xs text-muted-foreground">{CASE_TYPE_FIELD}</dt>
          <dd>
            <Badge variant="secondary">{CASE_TYPE_LABELS[values.caseType]}</Badge>
          </dd>
        </div>
      ) : null}
      {values.category ? (
        <div>
          <dt className="text-xs text-muted-foreground">{CATEGORY_FIELD}</dt>
          <dd>{CATEGORY_LABELS[values.category]}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-xs text-muted-foreground">{MODEL_FIELD}</dt>
        <dd>{values.modelName}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">{PURCHASE_DATE_FIELD}</dt>
        <dd>{formatPurchaseDate(values.purchaseDate)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">{DESCRIPTION_FIELD}</dt>
        <dd className="whitespace-pre-wrap break-words">{shownDescription}</dd>
        {isLong ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? SHOW_LESS : SHOW_MORE}
          </Button>
        ) : null}
      </div>
      {previewUrl ? (
        <div>
          <dt className="sr-only">{PHOTO_FIELD}</dt>
          <dd>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" className="h-auto p-0">
                  {/* Blob preview from the local file: next/image cannot optimise it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="" className="size-20 rounded-md border object-cover" />
                  <span className="sr-only">{ZOOM_PHOTO_BUTTON}</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle className="sr-only">{PHOTO_FIELD}</DialogTitle>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={PHOTO_PREVIEW_ALT} className="max-h-[70vh] w-full rounded-md object-contain" />
              </DialogContent>
            </Dialog>
          </dd>
        </div>
      ) : null}
    </dl>
  );

  return (
    <section aria-label={CASE_SUMMARY_LABEL} className="rounded-lg border bg-card p-4">
      <Collapsible open={mobileOpen} onOpenChange={setMobileOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="flex w-full justify-between lg:hidden">
            {CASE_SUMMARY_LABEL}
            <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", mobileOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        {/* Always mounted so the summary text stays in the DOM; hidden below lg unless opened. */}
        <CollapsibleContent forceMount className={cn("pt-3", !mobileOpen && "hidden lg:block")}>
          {details}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
