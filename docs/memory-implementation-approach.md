# Persistent Memory for Donna — Term Mappings and User Preferences

## The problem

`pms_lookup` now supports `filters` and `columns` (see `lib/agents/donna.ts` and
`lib/pms/schema.ts`). This lets Donna narrow a lookup instead of loading a
whole dataset. However, filters must use the exact values stored in PMS, such
as a sprint name or a status/leave-type string.

Users often use their own shorthand instead of those stored values:

> "Sprint 43 of GuideNow" → the system stores "DAP - 43"

If this mapping is not clear from the conversation, Donna may filter on the
user's words and get no results. It may then need to ask the user, discover the
stored value, and use it later in the conversation. Donna has to learn the same
mapping again in every session, and other users cannot use it. This is a
problem because `GuideNow Sprint 43 = DAP - 43` is an objective PMS fact, not
a personal preference.

This document proposes two different types of memory and explains how they
fit into the existing `donna.ts` agent and `pms/` layer.

## Why use two memory types?

The [OpenAI cookbook on context personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization)
distinguishes between **state-based memory** and **retrieval-based memory**:

- State-based memory stores structured, authoritative facts with known keys.
- Retrieval-based memory stores loosely related documents and finds them with
  fuzzy or semantic search.

The cookbook's advice for a travel concierge also applies here: structured
facts should be stored as state so decisions do not depend on fragile semantic
search.

A term mapping (`Sprint 43 of GuideNow → DAP - 43`) is a structured fact. It
has one correct value and should never be matched fuzzily to the wrong value.
A preference such as "I usually mean this month when I say 'recently'" is
different. It is advice, may be wrong, and should not break a query.

For that reason, this design uses two stores with different retrieval rules:

| | Term Mapping Memory | User Preference Memory |
|---|---|---|
| Scope | Shared across the organization | Per user |
| Nature | Structured, authoritative, keyed | Advisory, narrative |
| Lookup | Exact or near-exact key match | Injected in full (small and curated) |
| Example | `"sprint 43 guidenow" → "DAP - 43"` | "Usually asks about PL, not LOP" |
| Cost of a wrong entry | High — it can silently use the wrong filter | Low — it may only affect tone or defaults |

## Architecture overview

```
                     ┌─────────────────────────────┐
                     │   Term Mapping Store        │  (shared, all users)
                     │   Postgres/SQLite table      │
                     │   field, user_phrase,       │
                     │   canonical_value,          │
                     │   confidence, source,       │
                     │   last_confirmed            │
                     └──────────────┬──────────────┘
                                    │ exact/near-exact lookup
                                    │ keyed by (field, phrase)
                                    ▼
  User message ──► resolve_term_mapping tool ──► Donna resolves the phrase
                         (new server tool)             before calling pms_lookup
                                    │
                                    │ when a user corrects a mapping
                                    ▼
                     ┌─────────────────────────────┐
                     │  save_term_mapping tool     │ (writes, low friction)
                     └─────────────────────────────┘

                     ┌─────────────────────────────┐
                     │  User Preference Store      │  (per user)
                     │  Postgres/SQLite table       │
                     │  user_id, note, keywords,   │
                     │  last_update_date           │
                     └──────────────┬──────────────┘
                                    │ injected into the system prompt
                                    │ at session start
                                    ▼
                          Donna's instructions (donna.ts)
```

Both stores are server-side in Next.js and are available to tools in
`lib/agents/donna.ts`. They do not live in the Chrome extension. PMS actions
run in the extension because they use the user's PMS session and token, but
knowledge learned about PMS is shared across users and sessions. It belongs
on the server, like the existing manifest bundle in `lib/pms/manifests/`,
which is served through `GET /api/pms/manifests`.

## 1. Term Mapping Memory (shared, structured, authoritative)

### Storage

Use one table in the SQL store that is already available. A vector database is
not needed:

```sql
CREATE TABLE pms_term_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_name   TEXT NOT NULL,      -- e.g. "getLeaveApplicationStatus"
  field_name    TEXT NOT NULL,      -- e.g. "Sprint" (a filterable field)
  user_phrase   TEXT NOT NULL,      -- normalized lowercase: "sprint 43 guidenow"
  canonical_value TEXT NOT NULL,    -- exact stored value: "DAP - 43"
  confidence    REAL NOT NULL DEFAULT 1.0,
  source        TEXT NOT NULL,      -- "user_confirmed" | "inferred" | "seed"
  created_by    TEXT,               -- first user's id (audit only)
  confirmations INT NOT NULL DEFAULT 1,
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lookup_name, field_name, user_phrase)
);
```

Term mappings are short, canonical values. They need exact or near-exact
matching, not semantic embeddings. This follows the cookbook's point that
embedding-based retrieval is a poor fit when the answer must be deterministic
and authoritative.

Normalize the phrase by lowercasing it and collapsing punctuation and
whitespace. A cheap fallback such as `pg_trgm` similarity or `LIKE` is enough.
The data remains easy for a human to inspect and correct, unlike embeddings.

### Retrieve only relevant mappings

Add these tools to `lib/agents/donna.ts`, next to the existing
`pmsLookup`/`submitPmsAction` tools:

- **`resolve_term_mapping`** — accepts `{ lookupName, fieldName, phrase }`.
  It searches `pms_term_mappings` for that exact `(lookup_name, field_name)`
  pair, so a sprint mapping cannot be used for a leave-type field. It returns
  the best match or matches with confidence, or `null`.

  Donna calls this before building `pms_lookup` filters when a filter value is
  a free-form phrase instead of a known enum value. The
  `queryableFilterFieldNames` information in `lib/pms/schema.ts` already tells
  the model which fields have fixed valid values. Mapping is needed only for
  open fields such as sprint names.

This meets the requirement to retrieve only relevant memory. Every call is
scoped by `(lookupName, fieldName)`, so it returns only a few candidates and
never the complete mapping table. No embedding index is needed; the scope is
the relevance filter.

### Automatically inject common mappings

For busy fields with few possible values, such as active sprints, cost
centers, or project codes, the manifest can define a small **hot cache**.
Donna injects these mappings into the system prompt when a session starts, so
common lookups do not need a tool call:

```ts
// lib/pms/types.ts addition
export interface PmsLookupDefinition {
  // ...existing fields
  hotTermField?: string; // e.g. "Sprint"; mappings for this field are
                         // preloaded into Donna's instructions
}
```

`donna.ts` loads the top-N confirmed mappings for each `hotTermField` once at
session start and adds a compact block:

```
Known term mappings (use the canonical value when filtering):
- "sprint 43" / "sprint 43 guidenow" → "DAP - 43"
- "sprint 44" → "DAP - 44"
```

This uses the cookbook's memory-injection pattern: a small Markdown or YAML
block is added at session start. Only mappings above a confidence and
confirmation threshold go into the hot cache. Rare or long-tail phrases stay
in the `resolve_term_mapping` tool path so the prompt does not grow with
entries that are rarely needed.

### Continuous learning and validation

1. **Capture.** When `pms_lookup` uses a filter value derived from a user's
   free-form phrase, Donna passes both the original phrase and resolved value
   to `save_term_mapping`. Upsert the row with `source: "inferred"` and
   `confidence: 0.6`. This mirrors the cookbook's `save_memory_note` pattern.
2. **Confirm.** If a later lookup using the mapping returns matching,
   non-empty results and the user does not correct it, increase
   `confirmations` and move confidence toward 1.0. A simple rule is:
   `confidence = min(1.0, 0.6 + 0.1 * confirmations)`.
   This is a simpler version of the cookbook's distillation and consolidation
   process. A counter is enough because these are already atomic key-to-value
   facts with no deduplication or merge ambiguity.
3. **Correct.** If the user says, "No, I meant X," Donna calls
   `save_term_mapping` with the corrected value. It must overwrite the row,
   not append another one, using the existing unique key. Copy the old value
   to a small `pms_term_mapping_history` audit table with the same columns and
   `superseded_at`, so a bad correction can be restored manually. Do not show
   this history to the model.
4. **Promote a seed set.** After the system has run for a while, export
   mappings with `confidence > 0.9` and `confirmations > 3`. Review them and
   add them in a `source: "seed"` batch. This is similar to promoting stable
   preferences into structured profile fields, but here it is used for shared
   organizational facts.

### Guardrails (based on the cookbook's memory guardrails)

- **Show uncertain resolutions.** A low-confidence mapping must not silently
  change a filter. If `resolve_term_mapping` returns a match with
  `confidence < 0.85`, Donna should say what it found, for example:
  "Sprint 43 — I'll use DAP - 43. Let me know if that is not right." High-
  confidence mappings in the hot cache may be used silently.
- **Do not store instructions.** Keep the `save_term_mapping` schema narrow:
  use a `lookupName` enum, a per-lookup `fieldName` enum, and plain strings for
  the phrase and value. This prevents users from hiding arbitrary instructions
  in shared memory through a free-text note field.
- **Always scope by lookup and field.** A mapping learned for one field must
  never affect another field. Enforce this through the composite key and the
  tool's required parameters, not only through convention.

## 2. User Preference Memory (per user, advisory)

This store is the more direct use of the cookbook's `TravelState` pattern,
adapted for Donna's PMS and chat features:

```sql
CREATE TABLE user_memory_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,     -- PMS employee code / user id
  text         TEXT NOT NULL,     -- "Usually asks about PL, not LOP."
  keywords     TEXT[] NOT NULL,   -- ["leave-type"]
  last_update_date DATE NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'global' -- 'global' | 'session'
);
```

- **Distillation:** Add a `save_user_note` tool, shaped like the cookbook's
  `save_memory_note`. Call it when the user states something durable and
  relevant to PMS, such as "I always mean my own leaves, not my team's" or
  "Call me by my first name." Session notes (`scope: 'session'`) exist only
  during the conversation, or in a short-TTL row, and are discarded unless
  the user confirms they should be kept.
- **Consolidation:** Run this asynchronously at the end of a session or on a
  cron job. As in the cookbook's `consolidate_memory`, remove duplicates,
  resolve conflicts by recency, and forget stale notes. PMS preferences are a
  narrow domain, so simple rules should be enough at first. Add an LLM step
  only if manual rules are not sufficient.
- **Injection:** At session start, `donna.ts` loads this user's top-K notes,
  ordered by `last_update_date`, and adds them as a small Markdown block in
  the system prompt. This is like the cookbook's
  `render_global_memories_md`: curated context, not the full history.
- **Precedence:** Use the same order as the cookbook: current message >
  session note > global note > default behavior. If a preference would change
  a PMS action, Donna must still ask for confirmation before submitting it.
  This matches the existing `submit_pms_action` approval-card behavior in
  `donna.ts`. Memory may personalize the conversation, but it must never skip
  the approval step.

## Where this connects to the existing agent

In `lib/agents/donna.ts`:

1. Add a server-side, database-backed `buildMemoryContext(userId)` function
   that returns `{ termMappingsBlock, userNotesBlock }`. Call it once per
   request while building the system prompt, alongside the existing
   `capabilitiesCatalog()` block.
2. Add three server tools: `resolve_term_mapping`, `save_term_mapping`, and
   `save_user_note`. These tools do not need a client round trip or approval
   card because they do not call PMS or the extension. Follow the existing
   `get_server_time` pattern.
3. Extend the system prompt section that documents `pms_lookup` (around line
   264) with a short memory policy. It should explain when to resolve a term,
   when to save a mapping, the precedence rules, and when to show a
   low-confidence resolution to the user.
4. Add the resolved `userId` to `DonnaRunContext`. It is already available
   through the PMS session, and this lets tools scope reads and writes without
   passing the user id through every tool call.

## Non-goals for this pass

- **No vector store or embeddings.** Both memory types are small, structured,
  and keyed by exact values. A vector database would add infrastructure and
  unwanted fuzziness. Reconsider this only if a future memory type is truly
  unstructured, such as remembering the main points of a discussion from last
  week. That case fits OpenAI's file-search/vector-store retrieval tools,
  not this design.
- **No fine-tuning.** As the cookbook concludes, this design remains
  zero-shot and uses prompts plus tools. A fine-tuned "memory specialist"
  could be considered later, after real failure data such as wrong mappings
  and missed corrections has accumulated.

## Verification

1. Seed several term mappings manually or through a real conversation. Confirm
   that `resolve_term_mapping` returns the correct canonical value for the
   `(lookupName, fieldName)` pair and never matches an unrelated field.
2. Ask, "How many days did I take in DAP-43?" without first saying "DAP -
   43" exactly. Confirm that Donna resolves "sprint 43" through the mapping
   before applying `pms_lookup` filters.
3. Correct a wrong mapping during a conversation. Confirm that the old value
   is moved to the history table and that the next lookup in a **new** session
   uses the corrected value. This proves the mapping persists across sessions.
4. Log in as a second user who never taught the mapping. Confirm that they get
   the same resolved value, proving the mapping is shared rather than
   user-specific.
5. Save a user preference in one session. Confirm that it appears as advisory
   context in a new session for the same user, but not for a different user.
