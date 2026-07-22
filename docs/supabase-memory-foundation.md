# Supabase memory foundation

The database foundation and Donna integration for shared and user-specific
memory are implemented.

## Live schema

| Object | Purpose |
|---|---|
| `memory_tenants` | Isolates each organization |
| `memory_tenant_members` | Connects Supabase Auth users to tenants and roles |
| `pms_term_mappings` | Stores shared aliases such as `Sprint 43 -> DAP - 43` |
| `pms_value_rules` | Stores reusable filter transformations such as numeric leave ID -> `VM/LAP/{number}` |
| `pms_value_rule_evidence` | Deduplicates supporting and contradicting tool evidence for each rule |
| `user_memories` | Stores private terminology, preferences, behavior, constraints, and profile notes |
| `memory_audit_log` | Records mapping and user-memory changes |
| `resolve_pms_term` | Retrieves exact/fuzzy PMS mappings within one tenant, lookup, field, and project |
| `record_pms_value_rule_observation` | Atomically learns, validates, or contradicts a reusable rule |
| `search_user_memories` | Retrieves only relevant, non-expired memories for one user |

All public tables have row-level security. Shared mapping/rule writes require
an owner/admin role or the authenticated server workflow; users can only
manage their own user memories. Retrieval is indexed with deterministic keys
and `pg_trgm` fuzzy matching.

Reusable rules are distilled only after completed turns containing PMS tool
results. Raw transcripts and one-off statuses are not copied into Supabase.
One observation creates a candidate; three independent supporting turns with
no contradictions promote it to verified. Contradictions lower confidence and
are preserved as evidence instead of silently replacing the rule.

## Application code

- `lib/supabase/database.types.ts`: generated from the live project.
- `lib/supabase/server.ts`: server-only typed Supabase client.
- `lib/memory/repository.ts`: typed retrieval, candidate creation,
  verification, correction, and user-memory operations.

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server
environment. Never expose the service-role key to the extension.

Donna validates the PMS bearer token server-side and derives trusted tenant and
user identities before accessing either store. Mem0 is the semantic,
user-specific layer; Supabase remains the governed store for shared facts and
evidence-backed reusable rules.
