import "server-only";

// Structured JSON logs without personal or secret data (ADR-002 TD-205). One line per call.
export type LogFields = Record<string, string | number | boolean | null | undefined>;

type Level = "info" | "warn" | "error";

// Field names that never reach a log line, whatever their value (image bytes, prompts, headers, keys).
const FORBIDDEN_FIELDS = new Set([
  "description",
  "text",
  "content",
  "prompt",
  "message",
  "messages",
  "dataUrl",
  "image",
  "bytes",
  "headers",
  "authorization",
  "apiKey",
]);

// Values containing these markers are replaced entirely.
const SECRET_MARKERS = ["data:image", "sk-or-"];

function safeValue(value: string | number | boolean | null | undefined): string | number | boolean | null | undefined {
  if (typeof value === "string" && SECRET_MARKERS.some((marker) => value.includes(marker))) return "[redacted]";
  return value;
}

export function createLogger(write: (line: string) => void = (line) => console.log(line)) {
  const emit = (level: Level, event: string, fields?: LogFields): void => {
    const safe: Record<string, string | number | boolean | null | undefined> = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (FORBIDDEN_FIELDS.has(key)) continue;
      safe[key] = safeValue(value);
    }
    // Fixed keys come last so a field cannot overwrite ts, level or event.
    write(JSON.stringify({ ...safe, ts: new Date().toISOString(), level, event: safeValue(event) }));
  };

  return {
    info(event: string, fields?: LogFields): void {
      emit("info", event, fields);
    },
    warn(event: string, fields?: LogFields): void {
      emit("warn", event, fields);
    },
    error(event: string, fields?: LogFields): void {
      emit("error", event, fields);
    },
  };
}

export const log: ReturnType<typeof createLogger> = createLogger();
