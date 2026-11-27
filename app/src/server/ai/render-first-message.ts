import "server-only";

import { generateId } from "ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import type { Decision } from "@/lib/shared/schemas/ai";
import type { CaseType } from "@/lib/shared/schemas/enums";
import { COMPANY_NAME, CASE_TYPE_LABELS } from "@/lib/shared/strings/common";

// First assistant message of a case (ADR-001 §3.7, PRD AC-29). The AC-41 notice is not a part:
// the UI appends it (ADR-001 TD-103).
export function renderFirstMessage(input: {
  caseType: CaseType;
  modelName: string;
  decision: Decision;
  createdAt: string;
  id?: string;
}): CaseUIMessage {
  const { caseType, decision } = input;
  const modelName = input.modelName.replace(/[\r\n]+/g, " ");
  const caseLabel = CASE_TYPE_LABELS[caseType].toLowerCase();

  const greeting = `Dzień dobry! Jestem asystentem ${COMPANY_NAME}. Przeanalizowałem Twoje zgłoszenie: ${caseLabel} – ${modelName}.`;

  const steps = decision.nextStepsPl.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const sections = [
    `### Co widzimy na zdjęciu\n\n${decision.photoSummaryPl}`,
    `### Uzasadnienie\n\n${decision.justificationPl}`,
    `Podstawa: ${decision.citedRuleIds.join(", ")}`,
    `### Kolejne kroki\n\n${steps}`,
  ];
  if (decision.outcome === "MANUAL_REVIEW" && decision.clarifyingQuestionsPl.length > 0) {
    const questions = decision.clarifyingQuestionsPl.map((question) => `- ${question}`).join("\n");
    sections.push(`### Pytania do Ciebie\n\n${questions}`);
  }
  const markdown = sections.join("\n\n");

  return {
    id: input.id ?? generateId(),
    role: "assistant",
    metadata: { createdAt: input.createdAt },
    parts: [
      { type: "text", text: greeting },
      { type: "data-decision", data: decision },
      { type: "text", text: markdown },
    ],
  };
}
