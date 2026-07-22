import "server-only";

import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { UserMemoryKind } from "./types";
import type { PmsValueRuleInputKind } from "./types";

export type { UserMemoryKind } from "./types";

type PmsMappingInsert =
  Database["public"]["Tables"]["pms_term_mappings"]["Insert"];
type PmsMappingUpdate =
  Database["public"]["Tables"]["pms_term_mappings"]["Update"];
type UserMemoryInsert =
  Database["public"]["Tables"]["user_memories"]["Insert"];
type UserMemoryUpdate =
  Database["public"]["Tables"]["user_memories"]["Update"];

export async function resolvePmsTerm(input: {
  tenantId: number;
  lookupName: string;
  fieldName: string;
  userValue: string;
  projectKey?: string;
  limit?: number;
}) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "resolve_pms_term",
    {
      p_tenant_id: input.tenantId,
      p_lookup_name: input.lookupName,
      p_field_name: input.fieldName,
      p_user_value: input.userValue,
      p_project_key: input.projectKey ?? "",
      p_limit: input.limit ?? 5,
    },
  );

  if (error) throw new Error(`Unable to resolve PMS terminology: ${error.message}`);
  return data;
}

export async function resolveExternalMemoryIdentity(input: {
  provider: string;
  externalTenantId: string;
  externalUserId: string;
  tenantName: string;
  displayName?: string;
  email?: string;
  metadata?: Json;
}) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "resolve_external_memory_identity",
    {
      p_provider: input.provider,
      p_external_tenant_id: input.externalTenantId,
      p_external_user_id: input.externalUserId,
      p_tenant_name: input.tenantName,
      p_display_name: input.displayName ?? "",
      p_email: input.email ?? "",
      p_metadata: input.metadata ?? {},
    },
  );

  if (error || !data?.[0]) {
    throw new Error(
      `Unable to resolve the authenticated identity: ${error?.message ?? "no identity returned"}`,
    );
  }

  return data[0];
}

export async function recordPmsMappingCandidate(input: {
  tenantId: number;
  identityId: number;
  lookupName: string;
  fieldName: string;
  alias: string;
  canonicalValue: string;
  projectKey?: string;
  source: "user_explicit" | "tool_success";
  metadata?: Json;
}) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "record_pms_mapping_candidate",
    {
      p_tenant_id: input.tenantId,
      p_identity_id: input.identityId,
      p_lookup_name: input.lookupName,
      p_field_name: input.fieldName,
      p_alias: input.alias,
      p_canonical_value: input.canonicalValue,
      p_project_key: input.projectKey ?? "",
      p_source: input.source,
      p_metadata: input.metadata ?? {},
    },
  );

  if (error || !data?.[0]) {
    throw new Error(
      `Unable to record the PMS terminology candidate: ${error?.message ?? "no mapping returned"}`,
    );
  }

  return data[0];
}

export async function listPmsValueRules(input: {
  tenantId: number;
  lookupName: string;
  fieldName: string;
  projectKey?: string;
}) {
  let query = getSupabaseServerClient()
    .from("pms_value_rules")
    .select(
      "id,input_kind,input_label,output_prefix,output_suffix,project_key,status,confidence,evidence_count,contradiction_count",
    )
    .eq("tenant_id", input.tenantId)
    .eq("lookup_name", input.lookupName)
    .eq("field_name", input.fieldName)
    .in("status", ["candidate", "verified"]);

  query = input.projectKey?.trim()
    ? query.in("project_key", ["", input.projectKey.trim()])
    : query.eq("project_key", "");

  const { data, error } = await query
    .order("status", { ascending: false })
    .order("confidence", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Unable to retrieve PMS value rules: ${error.message}`);
  return data;
}

export async function recordPmsValueRuleObservation(input: {
  tenantId: number;
  identityId: number;
  lookupName: string;
  fieldName: string;
  projectKey?: string;
  inputKind: PmsValueRuleInputKind;
  inputLabel?: string;
  outputPrefix: string;
  outputSuffix: string;
  exampleInput: string;
  exampleOutput: string;
  evidenceKey: string;
  source?: "tool_success" | "user_explicit";
  metadata?: Json;
}) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "record_pms_value_rule_observation",
    {
      p_tenant_id: input.tenantId,
      p_identity_id: input.identityId,
      p_lookup_name: input.lookupName,
      p_field_name: input.fieldName,
      p_project_key: input.projectKey ?? "",
      p_input_kind: input.inputKind,
      p_input_label: input.inputLabel ?? "",
      p_output_prefix: input.outputPrefix,
      p_output_suffix: input.outputSuffix,
      p_example_input: input.exampleInput,
      p_example_output: input.exampleOutput,
      p_evidence_key: input.evidenceKey,
      p_source: input.source ?? "tool_success",
      p_metadata: input.metadata ?? {},
    },
  );

  if (error || !data?.[0]) {
    throw new Error(
      `Unable to record the PMS value rule: ${error?.message ?? "no rule returned"}`,
    );
  }
  return data[0];
}

export async function searchUserMemories(input: {
  tenantId: number;
  userId: string;
  query: string;
  kinds?: UserMemoryKind[];
  limit?: number;
}) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "search_user_memories",
    {
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_query: input.query,
      p_kinds: input.kinds,
      p_limit: input.limit ?? 8,
    },
  );

  if (error) throw new Error(`Unable to search user memories: ${error.message}`);
  return data;
}

export async function createPmsMappingCandidate(
  input: Omit<PmsMappingInsert, "status"> & { status?: "candidate" },
) {
  const { data, error } = await getSupabaseServerClient()
    .from("pms_term_mappings")
    .insert({ ...input, status: "candidate" })
    .select()
    .single();

  if (error) throw new Error(`Unable to create PMS mapping candidate: ${error.message}`);
  return data;
}

export async function updatePmsMapping(
  mappingId: number,
  update: PmsMappingUpdate,
) {
  const { data, error } = await getSupabaseServerClient()
    .from("pms_term_mappings")
    .update(update)
    .eq("id", mappingId)
    .select()
    .single();

  if (error) throw new Error(`Unable to update PMS mapping: ${error.message}`);
  return data;
}

export async function verifyPmsMapping(input: {
  mappingId: number;
  verifiedBy: string;
  canonicalValue?: string;
  confidence?: number;
  metadata?: Json;
}) {
  return updatePmsMapping(input.mappingId, {
    ...(input.canonicalValue
      ? { canonical_value: input.canonicalValue }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    confidence: input.confidence ?? 1,
    last_verified_at: new Date().toISOString(),
    status: "verified",
    verified_by: input.verifiedBy,
  });
}

export async function createUserMemory(
  input: Omit<UserMemoryInsert, "kind"> & { kind: UserMemoryKind },
) {
  const { data, error } = await getSupabaseServerClient()
    .from("user_memories")
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Unable to create user memory: ${error.message}`);
  return data;
}

export async function updateUserMemory(
  memoryId: number,
  update: UserMemoryUpdate,
) {
  const { data, error } = await getSupabaseServerClient()
    .from("user_memories")
    .update(update)
    .eq("id", memoryId)
    .select()
    .single();

  if (error) throw new Error(`Unable to update user memory: ${error.message}`);
  return data;
}

export async function deleteUserMemory(memoryId: number) {
  const { error } = await getSupabaseServerClient()
    .from("user_memories")
    .delete()
    .eq("id", memoryId);

  if (error) throw new Error(`Unable to delete user memory: ${error.message}`);
}
