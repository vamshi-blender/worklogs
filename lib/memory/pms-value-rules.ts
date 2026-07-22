import "server-only";

import { listPmsValueRules, resolvePmsTerm } from "./repository";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transformRule(
  rule: Awaited<ReturnType<typeof listPmsValueRules>>[number],
  userValue: string,
): string | null {
  const trimmed = userValue.trim();
  let capturedNumber: string | undefined;

  if (rule.input_kind === "digits_only") {
    capturedNumber = /^\d+$/.exec(trimmed)?.[0];
  } else if (rule.input_kind === "labeled_number" && rule.input_label) {
    capturedNumber = new RegExp(
      `^${escapeRegExp(rule.input_label)}[\\s#:_-]*(\\d+)$`,
      "i",
    ).exec(trimmed)?.[1];
  }

  return capturedNumber
    ? `${rule.output_prefix}${capturedNumber}${rule.output_suffix}`
    : null;
}

export async function resolvePmsFilterValue(input: {
  tenantId: number;
  lookupName: string;
  fieldName: string;
  userValue: string;
  projectKey?: string;
}) {
  const fixedMappings = await resolvePmsTerm(input);
  let rules: Awaited<ReturnType<typeof listPmsValueRules>> = [];
  try {
    rules = await listPmsValueRules(input);
  } catch (error) {
    // Keep existing fixed mappings available during a migration rollout or a
    // temporary rule-store outage. Learning is an enhancement, not a reason
    // to break live PMS lookups.
    console.error("Unable to retrieve reusable PMS value rules", error);
  }

  const transformations = rules.flatMap((rule) => {
    const canonicalValue = transformRule(rule, input.userValue);
    return canonicalValue
      ? [{
          ruleId: rule.id,
          canonicalValue,
          status: rule.status,
          confidence: rule.confidence,
          evidenceCount: rule.evidence_count,
          contradictionCount: rule.contradiction_count,
          projectKey: rule.project_key,
        }]
      : [];
  }).sort((left, right) => {
    const project = input.projectKey?.trim() ?? "";
    const projectDifference =
      Number(right.projectKey === project) - Number(left.projectKey === project);
    if (projectDifference) return projectDifference;
    const statusDifference =
      Number(right.status === "verified") - Number(left.status === "verified");
    return statusDifference || right.confidence - left.confidence;
  });

  return { fixedMappings, transformations };
}
