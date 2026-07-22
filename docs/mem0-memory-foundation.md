# Mem0 memory foundation

Mem0 Platform is configured as Donna's semantic, user-specific memory layer.
Donna is not wired to it yet.

## Responsibility split

| Store | Authoritative responsibility |
|---|---|
| Supabase | Tenants, membership, verified shared PMS mappings, validation, and audit history |
| Mem0 | Inferred user preferences, personal terminology, behavior, constraints, and profile context |

Verified shared facts must remain in Supabase. Mem0 output is advisory and must
not silently replace a verified PMS mapping.

## Application code

- `lib/mem0/server.ts` creates the server-only Mem0 Platform client.
- `lib/mem0/repository.ts` adds, searches, lists, updates, deletes, and
  retrieves history for user memories.
- `lib/memory/types.ts` contains provider-independent memory scope and kind
  types.

Every Mem0 user entity is namespaced as:

`workupdate:tenant:<tenantId>:user:<userId>`

Searches always include that complete entity identifier. ID-based reads,
updates, deletes, and history calls first verify that the returned memory
belongs to the expected entity.

## Configuration

Set `MEM0_API_KEY` in the Next.js server environment. Never expose it to the
Chrome extension or place it in a `NEXT_PUBLIC_*` variable.

The Codex Mem0 MCP uses OAuth independently from the Platform API key. The MCP
registration is:

```toml
[mcp_servers.mem0]
url = "https://mcp.mem0.ai/mcp"
```

After OAuth login, restart Codex so the Mem0 MCP tools are loaded into the new
session.

The MCP connection was verified on 2026-07-21 with a complete temporary
add/status/search/get/update/list/delete lifecycle. The test memory and test
entity were removed afterward.

## Next step

Once chat requests have trusted Supabase `tenantId` and `userId` values,
Donna can retrieve relevant Mem0 memories before each run and save durable
user facts after a run. Supabase term resolution should run separately for
PMS filters.
