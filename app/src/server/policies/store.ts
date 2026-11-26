import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getEnv } from "../env";

export interface Policy {
  caseType: "return" | "complaint";
  markdown: string;
  ruleIds: ReadonlySet<string>;
}

export class PolicyError extends Error {}

const BOLD_RULE_ID = /\*\*([RC]-\d+\.\d+)\*\*/g;
const MIN_RULE_IDS = 10;
const FILES = { return: "return-terms.md", complaint: "complaint-terms.md" } as const;

function readPolicy(dir: string, caseType: Policy["caseType"]): Policy {
  const fileName = FILES[caseType];
  let markdown: string;
  try {
    markdown = fs.readFileSync(path.join(dir, fileName), "utf8");
  } catch {
    throw new PolicyError(`Policy file ${fileName} is missing or unreadable`);
  }

  // Only bold markers count as rule IDs; plain mentions such as "(see C-1.2)" are ignored.
  const ruleIds = new Set<string>();
  for (const match of markdown.matchAll(BOLD_RULE_ID)) {
    if (match[1] !== undefined) ruleIds.add(match[1]);
  }

  const ownPrefix = caseType === "return" ? "R-" : "C-";
  const foreignPrefix = caseType === "return" ? "C-" : "R-";
  const ownCount = [...ruleIds].filter((id) => id.startsWith(ownPrefix)).length;
  const foreignCount = [...ruleIds].filter((id) => id.startsWith(foreignPrefix)).length;

  if (ownCount < MIN_RULE_IDS) {
    throw new PolicyError(
      `${fileName} must contain at least ${MIN_RULE_IDS} bold ${ownPrefix}n.n rule IDs (found ${ownCount})`,
    );
  }
  if (foreignCount > 0) {
    throw new PolicyError(`${fileName} must not contain bold ${foreignPrefix}n.n rule IDs`);
  }
  return { caseType, markdown, ruleIds };
}

// Sync reads at startup; throws PolicyError naming the offending file.
export function loadPolicies(dir: string): { return: Policy; complaint: Policy } {
  return {
    return: readPolicy(dir, "return"),
    complaint: readPolicy(dir, "complaint"),
  };
}

let cached: { return: Policy; complaint: Policy } | undefined;

export function getPolicies(): { return: Policy; complaint: Policy } {
  cached ??= loadPolicies(getEnv().POLICIES_DIR);
  return cached;
}
