import "server-only";

import { generateText, Output, type LanguageModel } from "ai";
import { imageAnalysisSchema, type ImageAnalysis, type LunaSignals } from "@/lib/shared/schemas/ai";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { CaseType } from "@/lib/shared/schemas/enums";
import { getAiProvider } from "@/server/ai/provider";
import { visionSystemPrompt, visionUserContent } from "@/server/ai/prompts/vision";
import { mapProviderError } from "@/server/errors";
import { log } from "@/server/log";
import type { ProcessedImage } from "@/server/image";

// Vision analysis stage (ADR-001 §3.3). Any failure is mapped to a domain error; no content is logged.

export interface VisionAnalyst {
  analyze(input: {
    caseType: CaseType;
    form: CaseFormInput;
    image: ProcessedImage;
    luna: LunaSignals;
    signal?: AbortSignal;
  }): Promise<ImageAnalysis>;
}

const DEFAULT_TIMEOUT_MS = 35_000;

function modelIdOf(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

export function createVisionAnalyst(deps: { model: LanguageModel; timeoutMs?: number }): VisionAnalyst {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = modelIdOf(deps.model);

  return {
    async analyze(input) {
      const started = Date.now();
      try {
        const result = await generateText({
          model: deps.model,
          system: visionSystemPrompt(input.caseType),
          messages: [
            {
              role: "user",
              content: visionUserContent({
                caseType: input.caseType,
                form: input.form,
                luna: input.luna,
                image: input.image,
              }),
            },
          ],
          output: Output.object({ schema: imageAnalysisSchema }),
          maxRetries: 1,
          timeout: { totalMs: timeoutMs },
          abortSignal: input.signal,
        });
        log.info("vision_done", { durationMs: Date.now() - started, model });
        return result.output;
      } catch (error) {
        const mapped = mapProviderError(error);
        log.warn("vision_failed", { code: mapped.code });
        throw mapped;
      }
    },
  };
}

let cached: VisionAnalyst | undefined;

/** Production analyst: the vision model from the cached OpenRouter provider. */
export function getVisionAnalyst(): VisionAnalyst {
  cached ??= createVisionAnalyst({ model: getAiProvider().model("vision") });
  return cached;
}
