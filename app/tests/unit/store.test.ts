import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CaseFormInput } from "@/lib/shared/schemas/case-form";
import type { ProcessedImage } from "@/server/image";
import { createCaseStore, getCaseStore } from "@/server/cases/store";

const MINUTE = 60_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORM: CaseFormInput = {
  caseType: "return",
  category: "laptop",
  modelName: "Synthetic Model",
  purchaseDate: "2026-01-01",
  description: "Synthetic description",
};

const IMAGE: ProcessedImage = {
  mediaType: "image/webp",
  width: 4,
  height: 3,
  bytes: Buffer.from("AAAA", "base64"),
  dataUrl: "data:image/webp;base64,AAAA",
};

// Mutable clock: tests advance it explicitly instead of relying on wall-clock time.
let clock = 0;
const now = () => clock;
const advanceMinutes = (minutes: number) => {
  clock += minutes * MINUTE;
};

describe("createCaseStore", () => {
  beforeEach(() => {
    clock = Date.parse("2026-11-26T10:00:00.000Z");
  });

  it("creates an analysed case with a UUID v4 id and keeps the image", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });

    const created = store.create({ form: FORM, image: IMAGE });
    const found = store.get(created.caseId);

    expect(created.caseId).toMatch(UUID_V4);
    expect(found?.caseId).toBe(created.caseId);
    expect(found?.status).toBe("analysed");
    expect(found?.image?.width).toBe(4);
    expect(found?.image?.mediaType).toBe("image/webp");
    expect(found?.luna).toBeNull();
    expect(found?.analysis).toBeNull();
    expect(found?.gates).toBeNull();
    expect(found?.decisions).toHaveLength(0);
    expect(found?.messages).toHaveLength(0);
    expect(found?.userMessageCount).toBe(0);
    expect(found?.busySince).toBeNull();
    expect(found?.createdAt).toBe("2026-11-26T10:00:00.000Z");
  });

  it("expires a case only after ttl of idle time, and an access refreshes the TTL", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });
    const { caseId } = store.create({ form: FORM, image: null });

    advanceMinutes(120);
    expect(store.get(caseId)).toBeDefined(); // minute 120: still alive, refreshed here

    advanceMinutes(120);
    clock += 1; // 1 ms beyond the idle TTL
    expect(store.get(caseId)).toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it("keeps a case alive when it was accessed at minute 100", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });
    const { caseId } = store.create({ form: FORM, image: null });

    advanceMinutes(100);
    expect(store.get(caseId)).toBeDefined();

    advanceMinutes(119);
    expect(store.get(caseId)).toBeDefined();
  });

  it("sweep removes only expired cases and returns their count", () => {
    const store = createCaseStore({ ttlMinutes: 60, now });
    const old = store.create({ form: FORM, image: null });
    const oldTwo = store.create({ form: FORM, image: null });

    advanceMinutes(45);
    const fresh = store.create({ form: FORM, image: null });

    advanceMinutes(30); // old cases idle 75 min (expired), fresh idle 30 min
    const removed = store.sweep();

    expect(removed).toBe(2);
    expect(store.size()).toBe(1);
    expect(store.get(fresh.caseId)).toBeDefined();
    expect(store.get(old.caseId)).toBeUndefined();
    expect(store.get(oldTwo.caseId)).toBeUndefined();
  });

  it("evicts the case with the oldest activity when the store is full", () => {
    const store = createCaseStore({ ttlMinutes: 120, capacity: 3, now });
    const a = store.create({ form: FORM, image: null });
    advanceMinutes(1);
    const b = store.create({ form: FORM, image: null });
    advanceMinutes(1);
    const c = store.create({ form: FORM, image: null });
    advanceMinutes(1);

    store.get(a.caseId); // a becomes the most recently active
    advanceMinutes(1);
    const d = store.create({ form: FORM, image: null });

    expect(store.size()).toBe(3);
    expect(store.get(b.caseId)).toBeUndefined();
    expect(store.get(a.caseId)).toBeDefined();
    expect(store.get(c.caseId)).toBeDefined();
    expect(store.get(d.caseId)).toBeDefined();
  });

  it("grants a lock once, refuses a second lock, and grants it again after unlock", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });
    const { caseId } = store.create({ form: FORM, image: null });

    expect(store.tryLock(caseId)).toBe(true);
    expect(store.tryLock(caseId)).toBe(false);
    store.unlock(caseId);
    expect(store.tryLock(caseId)).toBe(true);
  });

  it("takes over a lock older than lockStaleMs", () => {
    const store = createCaseStore({ ttlMinutes: 120, lockStaleMs: 120_000, now });
    const { caseId } = store.create({ form: FORM, image: null });

    expect(store.tryLock(caseId)).toBe(true);
    clock += 120_000;
    expect(store.tryLock(caseId)).toBe(false); // 120 000 ms: not yet older than the limit
    clock += 1;
    expect(store.tryLock(caseId)).toBe(true); // 120 001 ms: stale, taken over
  });

  it("refuses a lock on a missing case", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });

    expect(store.tryLock("00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("update mutates the case and refreshes its activity", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });
    const { caseId } = store.create({ form: FORM, image: null });

    advanceMinutes(30);
    const updated = store.update(caseId, (c) => {
      c.userMessageCount = 2;
      c.status = "decided";
    });

    expect(updated?.userMessageCount).toBe(2);
    expect(updated?.status).toBe("decided");
    expect(updated?.lastActivityAt).toBe(new Date(clock).toISOString());
    expect(store.update("00000000-0000-4000-8000-000000000000", () => undefined)).toBeUndefined();
  });

  it("delete returns true once and then false", () => {
    const store = createCaseStore({ ttlMinutes: 120, now });
    const { caseId } = store.create({ form: FORM, image: null });

    expect(store.delete(caseId)).toBe(true);
    expect(store.delete(caseId)).toBe(false);
    expect(store.size()).toBe(0);
  });
});

describe("getCaseStore", () => {
  const ENV_KEYS = ["OPENROUTER_API_KEY", "LLM_MODEL", "CASE_TTL_MINUTES"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    process.env.OPENROUTER_API_KEY = "test-key-not-real";
    process.env.LLM_MODEL = "openai/gpt-6-luna";
    process.env.CASE_TTL_MINUTES = "45";
    delete (globalThis as { __hsdcCaseStore?: unknown }).__hsdcCaseStore;
  });

  afterEach(() => {
    delete (globalThis as { __hsdcCaseStore?: unknown }).__hsdcCaseStore;
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("returns the same instance on repeated calls", () => {
    const first = getCaseStore();
    const second = getCaseStore();

    expect(first === second).toBe(true);
    expect((globalThis as { __hsdcCaseStore?: unknown }).__hsdcCaseStore === first).toBe(true);
  });
});
