import "server-only";

import { randomUUID } from "node:crypto";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { GateResult, Decision, ImageAnalysis, LunaSignals } from "@/lib/shared/schemas/ai";
import type { CaseUIMessage } from "@/lib/shared/schemas/api";
import { getEnv } from "@/server/env";
import type { ProcessedImage } from "@/server/image";

// In-memory case store (ADR-002 §3.2, §4.3; ADR-000 TD-04; PRD AC-37). Single process only.
export interface Case {
  caseId: string;
  createdAt: string; // ISO datetime
  lastActivityAt: string; // ISO datetime
  form: CaseFormInput;
  image: ProcessedImage | null; // cleared after the decision
  luna: LunaSignals | null;
  analysis: ImageAnalysis | null;
  gates: GateResult | null;
  decisions: Decision[];
  messages: CaseUIMessage[];
  status: "analysed" | "decided";
  busySince: number | null; // lock timestamp (ms)
  userMessageCount: number;
  timings?: { lunaMs?: number; visionMs?: number }; // stage durations of the analysis (evaluation log)
}

export type NewCase = Pick<Case, "form" | "image">;

export interface CaseStoreOptions {
  ttlMinutes: number;
  capacity?: number; // default 500
  lockStaleMs?: number; // default 120_000
  now?: () => number; // default Date.now
}

export type CaseStore = ReturnType<typeof createCaseStore>;

const SWEEP_INTERVAL_MS = 5 * 60_000;
const DEFAULT_CAPACITY = 500;
const DEFAULT_LOCK_STALE_MS = 120_000;

export function createCaseStore(options: CaseStoreOptions) {
  const ttlMs = options.ttlMinutes * 60_000;
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS;
  const now = options.now ?? Date.now;
  const cases = new Map<string, Case>();

  const iso = (ms: number) => new Date(ms).toISOString();
  const isExpired = (c: Case, at: number) => at - Date.parse(c.lastActivityAt) > ttlMs;

  // Returns a live case without refreshing its activity; expired cases are removed here.
  function live(caseId: string): Case | undefined {
    const c = cases.get(caseId);
    if (!c) return undefined;
    if (isExpired(c, now())) {
      cases.delete(caseId);
      return undefined;
    }
    return c;
  }

  function touch(c: Case): void {
    c.lastActivityAt = iso(now());
  }

  function sweep(): number {
    const at = now();
    let removed = 0;
    for (const [caseId, c] of cases) {
      if (isExpired(c, at)) {
        cases.delete(caseId);
        removed += 1;
      }
    }
    return removed;
  }

  function evictOldest(): void {
    let oldestId: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [caseId, c] of cases) {
      const at = Date.parse(c.lastActivityAt);
      if (at < oldestAt) {
        oldestAt = at;
        oldestId = caseId;
      }
    }
    if (oldestId !== undefined) cases.delete(oldestId);
  }

  return {
    create(input: NewCase): Case {
      sweep();
      while (cases.size >= capacity) evictOldest();

      const stamp = iso(now());
      const c: Case = {
        caseId: randomUUID(),
        createdAt: stamp,
        lastActivityAt: stamp,
        form: input.form,
        image: input.image,
        luna: null,
        analysis: null,
        gates: null,
        decisions: [],
        messages: [],
        status: "analysed",
        busySince: null,
        userMessageCount: 0,
      };
      cases.set(c.caseId, c);
      return c;
    },

    get(caseId: string): Case | undefined {
      const c = live(caseId);
      if (c) touch(c);
      return c;
    },

    update(caseId: string, mutate: (c: Case) => void): Case | undefined {
      const c = live(caseId);
      if (!c) return undefined;
      mutate(c);
      touch(c);
      return c;
    },

    delete(caseId: string): boolean {
      return cases.delete(caseId);
    },

    // A lock held for at most lockStaleMs blocks others; an older lock is taken over.
    tryLock(caseId: string): boolean {
      const c = live(caseId);
      if (!c) return false;
      const at = now();
      if (c.busySince !== null && at - c.busySince <= lockStaleMs) return false;
      c.busySince = at;
      return true;
    },

    unlock(caseId: string): void {
      const c = cases.get(caseId);
      if (c) c.busySince = null;
    },

    sweep,

    size(): number {
      return cases.size;
    },
  };
}

declare global {
  // Survives Next.js dev hot reload (one store per process).
  var __hsdcCaseStore: CaseStore | undefined;
}

export function getCaseStore(): CaseStore {
  if (!globalThis.__hsdcCaseStore) {
    const store = createCaseStore({ ttlMinutes: getEnv().CASE_TTL_MINUTES });
    const timer = setInterval(() => store.sweep(), SWEEP_INTERVAL_MS);
    timer.unref();
    globalThis.__hsdcCaseStore = store;
  }
  return globalThis.__hsdcCaseStore;
}
