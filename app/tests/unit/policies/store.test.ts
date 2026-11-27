import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PolicyError, loadPolicies } from "@/server/policies/store";

// tests/unit/policies -> repository root (four levels up) -> docs/policies
const REAL_DIR = path.resolve(import.meta.dirname, "../../../../docs/policies");
const RETURN_FILE = "return-terms.md";
const COMPLAINT_FILE = "complaint-terms.md";

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("loadPolicies with the real policy documents", () => {
  it("loads both policy sets with their case types", () => {
    const policies = loadPolicies(REAL_DIR);

    expect(policies.return.caseType).toBe("return");
    expect(policies.complaint.caseType).toBe("complaint");
    expect(policies.return.markdown.length).toBeGreaterThan(0);
    expect(policies.complaint.markdown.length).toBeGreaterThan(0);
  });

  it("finds at least ten bold rule IDs in each set", () => {
    const policies = loadPolicies(REAL_DIR);

    expect(policies.return.ruleIds.size).toBeGreaterThanOrEqual(10);
    expect(policies.complaint.ruleIds.size).toBeGreaterThanOrEqual(10);
  });

  it("contains the expected return rule IDs", () => {
    const { return: returnPolicy } = loadPolicies(REAL_DIR);

    expect(returnPolicy.ruleIds.has("R-2.1")).toBe(true);
    expect(returnPolicy.ruleIds.has("R-2.3")).toBe(true);
    expect(returnPolicy.ruleIds.has("R-2.4")).toBe(true);
    expect(returnPolicy.ruleIds.has("R-3.2")).toBe(true);
  });

  it("contains the expected complaint rule IDs", () => {
    const { complaint } = loadPolicies(REAL_DIR);

    expect(complaint.ruleIds.has("C-2.1")).toBe(true);
    expect(complaint.ruleIds.has("C-2.4")).toBe(true);
    expect(complaint.ruleIds.has("C-2.5")).toBe(true);
    expect(complaint.ruleIds.has("C-3.4")).toBe(true);
  });
});

describe("loadPolicies startup checks on copies of the real documents", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-store-test-"));
    for (const file of [RETURN_FILE, COMPLAINT_FILE]) {
      fs.copyFileSync(path.join(REAL_DIR, file), path.join(tempDir, file));
    }
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads the unmodified copies", () => {
    expect(() => loadPolicies(tempDir)).not.toThrow();
  });

  it("fails with a PolicyError naming the file when complaint-terms.md is missing", () => {
    fs.rmSync(path.join(tempDir, COMPLAINT_FILE));

    const error = captureError(() => loadPolicies(tempDir));

    expect(error).toBeInstanceOf(PolicyError);
    expect((error as PolicyError).message).toContain(COMPLAINT_FILE);
  });

  it("fails when the return terms contain a bold complaint rule ID", () => {
    fs.appendFileSync(path.join(tempDir, RETURN_FILE), "\n\n**C-9.9** Injected complaint rule.\n");

    const error = captureError(() => loadPolicies(tempDir));

    expect(error).toBeInstanceOf(PolicyError);
    expect((error as PolicyError).message).toContain(RETURN_FILE);
  });

  it("fails when the complaint terms have no bold rule IDs left", () => {
    const complaintPath = path.join(tempDir, COMPLAINT_FILE);
    const original = fs.readFileSync(complaintPath, "utf8");
    fs.writeFileSync(complaintPath, original.replace(/\*\*([RC]-\d+\.\d+)\*\*/g, "$1"));

    const error = captureError(() => loadPolicies(tempDir));

    expect(error).toBeInstanceOf(PolicyError);
    expect((error as PolicyError).message).toContain(COMPLAINT_FILE);
  });

  it("ignores plain mentions of rule IDs that are not bold markers", () => {
    fs.appendFileSync(path.join(tempDir, RETURN_FILE), "\n\nSee also (see C-1.2) and R-9.9.\n");

    const policies = loadPolicies(tempDir);

    expect(policies.return.ruleIds.has("C-1.2")).toBe(false);
    expect(policies.return.ruleIds.has("R-9.9")).toBe(false);
  });
});
