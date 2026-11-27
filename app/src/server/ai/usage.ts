import "server-only";

// Cost helpers for the ai_call log line (T24a). The account is BYOK: OpenRouter reports cost 0 and the
// real price in cost_details.upstream_inference_cost, so that field is preferred over cost.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Pure: cost in USD from the AI SDK providerMetadata (camelCase), or null when none is reported. */
export function costFromProviderMetadata(meta: unknown): number | null {
  if (!isRecord(meta) || !isRecord(meta.openrouter) || !isRecord(meta.openrouter.usage)) return null;
  const usage = meta.openrouter.usage;
  const upstream = isRecord(usage.costDetails) ? finiteNumber(usage.costDetails.upstreamInferenceCost) : null;
  return upstream ?? finiteNumber(usage.cost);
}

/** Pure: cost in USD from the raw OpenRouter usage object (snake_case), or null when none is reported. */
export function costFromRawUsage(usage: unknown): number | null {
  if (!isRecord(usage)) return null;
  const upstream = isRecord(usage.cost_details) ? finiteNumber(usage.cost_details.upstream_inference_cost) : null;
  return upstream ?? finiteNumber(usage.cost);
}
