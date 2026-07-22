create extension if not exists pg_trgm with schema extensions;

create schema if not exists memory_private;
revoke all on schema memory_private from public, anon, authenticated;

create table public.memory_tenants (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_tenant_members (
  tenant_id bigint not null references public.memory_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index memory_tenant_members_user_id_idx
  on public.memory_tenant_members (user_id, tenant_id);

create table public.pms_term_mappings (
  id bigint generated always as identity primary key,
  tenant_id bigint not null references public.memory_tenants(id) on delete cascade,
  lookup_name text not null check (length(btrim(lookup_name)) between 1 and 120),
  field_name text not null check (length(btrim(field_name)) between 1 and 120),
  project_key text not null default '',
  project_key_normalized text generated always as (
    lower(regexp_replace(btrim(project_key), '\s+', ' ', 'g'))
  ) stored,
  alias text not null check (length(btrim(alias)) between 1 and 500),
  alias_normalized text generated always as (
    lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))
  ) stored,
  canonical_value text not null
    check (length(btrim(canonical_value)) between 1 and 500),
  canonical_value_normalized text generated always as (
    lower(regexp_replace(btrim(canonical_value), '\s+', ' ', 'g'))
  ) stored,
  status text not null default 'candidate'
    check (status in ('candidate', 'verified', 'rejected', 'superseded')),
  confidence numeric(4, 3) not null default 0.500
    check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  source text not null default 'agent'
    check (source in ('agent', 'user_explicit', 'tool_success', 'admin', 'import')),
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  last_verified_at timestamptz,
  superseded_by bigint references public.pms_term_mappings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'verified' or last_verified_at is not null),
  check (status <> 'superseded' or superseded_by is not null),
  check (superseded_by is null or superseded_by <> id)
);

create unique index pms_term_mappings_active_alias_uidx
  on public.pms_term_mappings (
    tenant_id,
    lookup_name,
    field_name,
    project_key_normalized,
    alias_normalized
  )
  where status in ('candidate', 'verified');

create index pms_term_mappings_resolution_idx
  on public.pms_term_mappings (
    tenant_id,
    lookup_name,
    field_name,
    project_key_normalized,
    status
  );

create index pms_term_mappings_alias_trgm_idx
  on public.pms_term_mappings
  using gin (alias_normalized extensions.gin_trgm_ops)
  where status in ('candidate', 'verified');

create index pms_term_mappings_canonical_trgm_idx
  on public.pms_term_mappings
  using gin (canonical_value_normalized extensions.gin_trgm_ops)
  where status in ('candidate', 'verified');

create index pms_term_mappings_created_by_idx
  on public.pms_term_mappings (created_by)
  where created_by is not null;

create index pms_term_mappings_verified_by_idx
  on public.pms_term_mappings (verified_by)
  where verified_by is not null;

create index pms_term_mappings_superseded_by_idx
  on public.pms_term_mappings (superseded_by)
  where superseded_by is not null;

create table public.user_memories (
  id bigint generated always as identity primary key,
  tenant_id bigint not null references public.memory_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null
    check (kind in ('terminology', 'preference', 'behavior', 'constraint', 'profile_note')),
  memory_key text not null check (length(btrim(memory_key)) between 1 and 200),
  memory_key_normalized text generated always as (
    lower(regexp_replace(btrim(memory_key), '\s+', ' ', 'g'))
  ) stored,
  memory_value text not null check (length(btrim(memory_value)) between 1 and 2000),
  status text not null default 'candidate'
    check (status in ('candidate', 'verified', 'rejected', 'superseded')),
  confidence numeric(4, 3) not null default 0.500
    check (confidence between 0 and 1),
  source text not null default 'agent'
    check (source in ('agent', 'user_explicit', 'tool_success', 'admin', 'import')),
  context_tags text[] not null default '{}'::text[],
  last_confirmed_at timestamptz,
  expires_at timestamptz,
  superseded_by bigint references public.user_memories(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'verified' or last_confirmed_at is not null),
  check (status <> 'superseded' or superseded_by is not null),
  check (superseded_by is null or superseded_by <> id),
  check (expires_at is null or expires_at > created_at)
);

create unique index user_memories_active_key_uidx
  on public.user_memories (
    tenant_id,
    user_id,
    kind,
    memory_key_normalized
  )
  where status in ('candidate', 'verified');

create index user_memories_retrieval_idx
  on public.user_memories (user_id, tenant_id, status, kind, updated_at desc);

create index user_memories_key_trgm_idx
  on public.user_memories
  using gin (memory_key_normalized extensions.gin_trgm_ops)
  where status in ('candidate', 'verified');

create index user_memories_value_trgm_idx
  on public.user_memories
  using gin (lower(memory_value) extensions.gin_trgm_ops)
  where status in ('candidate', 'verified');

create index user_memories_context_tags_idx
  on public.user_memories using gin (context_tags);

create index user_memories_superseded_by_idx
  on public.user_memories (superseded_by)
  where superseded_by is not null;

create table public.memory_audit_log (
  id bigint generated always as identity primary key,
  tenant_id bigint not null references public.memory_tenants(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('pms_term_mapping', 'user_memory')),
  entity_id bigint not null,
  subject_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  old_record jsonb,
  new_record jsonb,
  created_at timestamptz not null default now(),
  check (old_record is not null or new_record is not null)
);

create index memory_audit_log_entity_idx
  on public.memory_audit_log (entity_type, entity_id, created_at desc);

create index memory_audit_log_tenant_idx
  on public.memory_audit_log (tenant_id, created_at desc);

create index memory_audit_log_subject_user_idx
  on public.memory_audit_log (subject_user_id, created_at desc)
  where subject_user_id is not null;

create index memory_audit_log_actor_user_idx
  on public.memory_audit_log (actor_user_id)
  where actor_user_id is not null;

create or replace function memory_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function memory_private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_id bigint;
  record_tenant_id bigint;
  record_subject_user_id uuid;
  record_entity_type text;
  old_record jsonb;
  new_record jsonb;
  changed_record jsonb;
begin
  old_record := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_record := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  changed_record := case when tg_op = 'DELETE' then old_record else new_record end;
  record_id := (changed_record ->> 'id')::bigint;
  record_tenant_id := (changed_record ->> 'tenant_id')::bigint;
  record_entity_type := case
    when tg_table_name = 'pms_term_mappings' then 'pms_term_mapping'
    else 'user_memory'
  end;
  record_subject_user_id := nullif(changed_record ->> 'user_id', '')::uuid;

  insert into public.memory_audit_log (
    tenant_id,
    entity_type,
    entity_id,
    subject_user_id,
    actor_user_id,
    operation,
    old_record,
    new_record
  ) values (
    record_tenant_id,
    record_entity_type,
    record_id,
    record_subject_user_id,
    auth.uid(),
    lower(tg_op),
    old_record,
    new_record
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function memory_private.set_updated_at() from public, anon, authenticated;
revoke all on function memory_private.write_audit_log() from public, anon, authenticated;

create trigger memory_tenants_set_updated_at
before update on public.memory_tenants
for each row execute function memory_private.set_updated_at();

create trigger pms_term_mappings_set_updated_at
before update on public.pms_term_mappings
for each row execute function memory_private.set_updated_at();

create trigger user_memories_set_updated_at
before update on public.user_memories
for each row execute function memory_private.set_updated_at();

create trigger pms_term_mappings_audit
after insert or update or delete on public.pms_term_mappings
for each row execute function memory_private.write_audit_log();

create trigger user_memories_audit
after insert or update or delete on public.user_memories
for each row execute function memory_private.write_audit_log();

create or replace function public.resolve_pms_term(
  p_tenant_id bigint,
  p_lookup_name text,
  p_field_name text,
  p_user_value text,
  p_project_key text default null,
  p_limit integer default 5
)
returns table (
  mapping_id bigint,
  alias text,
  canonical_value text,
  project_key text,
  status text,
  confidence numeric,
  score real,
  last_verified_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      lower(regexp_replace(btrim(p_user_value), '\s+', ' ', 'g')) as value_normalized,
      lower(regexp_replace(btrim(coalesce(p_project_key, '')), '\s+', ' ', 'g')) as project_normalized
  ), ranked as (
    select
      mapping.id as mapping_id,
      mapping.alias,
      mapping.canonical_value,
      mapping.project_key,
      mapping.status,
      mapping.confidence,
      case
        when mapping.alias_normalized = input.value_normalized then 1.0
        when mapping.canonical_value_normalized = input.value_normalized then 0.98
        else greatest(
          extensions.similarity(mapping.alias_normalized, input.value_normalized),
          extensions.similarity(mapping.canonical_value_normalized, input.value_normalized),
          extensions.word_similarity(mapping.alias_normalized, input.value_normalized),
          extensions.word_similarity(mapping.canonical_value_normalized, input.value_normalized)
        )
      end::real as score,
      mapping.last_verified_at,
      case
        when input.project_normalized <> ''
          and mapping.project_key_normalized = input.project_normalized then 1
        when mapping.project_key_normalized = '' then 0
        else -1
      end as project_rank
    from public.pms_term_mappings as mapping
    cross join input
    where mapping.tenant_id = p_tenant_id
      and mapping.lookup_name = p_lookup_name
      and mapping.field_name = p_field_name
      and mapping.status in ('candidate', 'verified')
      and (
        input.project_normalized = ''
        or mapping.project_key_normalized in ('', input.project_normalized)
      )
      and (
        mapping.alias_normalized = input.value_normalized
        or mapping.canonical_value_normalized = input.value_normalized
        or mapping.alias_normalized OPERATOR(extensions.%) input.value_normalized
        or mapping.canonical_value_normalized OPERATOR(extensions.%) input.value_normalized
        or extensions.word_similarity(mapping.alias_normalized, input.value_normalized) >= 0.6
        or extensions.word_similarity(mapping.canonical_value_normalized, input.value_normalized) >= 0.6
      )
  )
  select
    ranked.mapping_id,
    ranked.alias,
    ranked.canonical_value,
    ranked.project_key,
    ranked.status,
    ranked.confidence,
    ranked.score,
    ranked.last_verified_at
  from ranked
  order by
    ranked.project_rank desc,
    (ranked.status = 'verified') desc,
    ranked.score desc,
    ranked.confidence desc,
    ranked.last_verified_at desc nulls last
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

create or replace function public.search_user_memories(
  p_tenant_id bigint,
  p_user_id uuid,
  p_query text,
  p_kinds text[] default null,
  p_limit integer default 5
)
returns table (
  memory_id bigint,
  kind text,
  memory_key text,
  memory_value text,
  status text,
  confidence numeric,
  context_tags text[],
  score real,
  last_confirmed_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g')) as query_normalized
  ), ranked as (
    select
      memory.id as memory_id,
      memory.kind,
      memory.memory_key,
      memory.memory_value,
      memory.status,
      memory.confidence,
      memory.context_tags,
      case
        when input.query_normalized = '' then memory.confidence::real
        when memory.memory_key_normalized = input.query_normalized then 1.0
        else greatest(
          extensions.similarity(memory.memory_key_normalized, input.query_normalized),
          extensions.similarity(lower(memory.memory_value), input.query_normalized)
        )
      end::real as score,
      memory.last_confirmed_at,
      memory.expires_at
    from public.user_memories as memory
    cross join input
    where memory.tenant_id = p_tenant_id
      and memory.user_id = p_user_id
      and memory.status in ('candidate', 'verified')
      and (memory.expires_at is null or memory.expires_at > now())
      and (p_kinds is null or memory.kind = any(p_kinds))
      and (
        input.query_normalized = ''
        or memory.memory_key_normalized = input.query_normalized
        or memory.memory_key_normalized OPERATOR(extensions.%) input.query_normalized
        or lower(memory.memory_value) OPERATOR(extensions.%) input.query_normalized
      )
  )
  select
    ranked.memory_id,
    ranked.kind,
    ranked.memory_key,
    ranked.memory_value,
    ranked.status,
    ranked.confidence,
    ranked.context_tags,
    ranked.score,
    ranked.last_confirmed_at,
    ranked.expires_at
  from ranked
  order by
    (ranked.status = 'verified') desc,
    ranked.score desc,
    ranked.confidence desc,
    ranked.last_confirmed_at desc nulls last
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

alter table public.memory_tenants enable row level security;
alter table public.memory_tenant_members enable row level security;
alter table public.pms_term_mappings enable row level security;
alter table public.user_memories enable row level security;
alter table public.memory_audit_log enable row level security;

create policy memory_tenants_select_member
on public.memory_tenants for select to authenticated
using (
  exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = memory_tenants.id
      and member.user_id = (select auth.uid())
  )
);

create policy memory_tenant_members_select_self
on public.memory_tenant_members for select to authenticated
using (user_id = (select auth.uid()));

create policy pms_term_mappings_select_member
on public.pms_term_mappings for select to authenticated
using (
  exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = pms_term_mappings.tenant_id
      and member.user_id = (select auth.uid())
  )
);

create policy pms_term_mappings_insert_admin
on public.pms_term_mappings for insert to authenticated
with check (
  exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = pms_term_mappings.tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  )
);

create policy pms_term_mappings_update_admin
on public.pms_term_mappings for update to authenticated
using (
  exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = pms_term_mappings.tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = pms_term_mappings.tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  )
);

create policy user_memories_select_own
on public.user_memories for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = user_memories.tenant_id
      and member.user_id = (select auth.uid())
  )
);

create policy user_memories_insert_own
on public.user_memories for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = user_memories.tenant_id
      and member.user_id = (select auth.uid())
  )
);

create policy user_memories_update_own
on public.user_memories for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = user_memories.tenant_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = user_memories.tenant_id
      and member.user_id = (select auth.uid())
  )
);

create policy user_memories_delete_own
on public.user_memories for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.memory_tenant_members as member
    where member.tenant_id = user_memories.tenant_id
      and member.user_id = (select auth.uid())
  )
);

create policy memory_audit_log_select_authorized
on public.memory_audit_log for select to authenticated
using (
  (
    entity_type = 'user_memory'
    and subject_user_id = (select auth.uid())
  )
  or (
    entity_type = 'pms_term_mapping'
    and exists (
      select 1
      from public.memory_tenant_members as member
      where member.tenant_id = memory_audit_log.tenant_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  )
);

revoke all on table
  public.memory_tenants,
  public.memory_tenant_members,
  public.pms_term_mappings,
  public.user_memories,
  public.memory_audit_log
from anon;

grant select on public.memory_tenants, public.memory_tenant_members to authenticated;
grant select, insert, update on public.pms_term_mappings to authenticated;
grant select, insert, update, delete on public.user_memories to authenticated;
grant select on public.memory_audit_log to authenticated;

grant usage, select on sequence
  public.pms_term_mappings_id_seq,
  public.user_memories_id_seq
to authenticated;

grant all on table
  public.memory_tenants,
  public.memory_tenant_members,
  public.pms_term_mappings,
  public.user_memories,
  public.memory_audit_log
to service_role;

grant all on all sequences in schema public to service_role;

revoke all on function public.resolve_pms_term(bigint, text, text, text, text, integer)
from public, anon;
revoke all on function public.search_user_memories(bigint, uuid, text, text[], integer)
from public, anon;
grant execute on function public.resolve_pms_term(bigint, text, text, text, text, integer)
to authenticated, service_role;
grant execute on function public.search_user_memories(bigint, uuid, text, text[], integer)
to authenticated, service_role;

comment on table public.memory_tenants is
  'Organizations whose shared and user memories must remain isolated.';
comment on table public.memory_tenant_members is
  'Supabase Auth users authorized to access one memory tenant.';
comment on table public.pms_term_mappings is
  'Auditable aliases that resolve user terminology to canonical PMS filter values.';
comment on table public.user_memories is
  'Private cross-session preferences, terminology, constraints, and behavior notes.';
comment on table public.memory_audit_log is
  'Immutable audit history generated by mapping and user-memory table triggers.';
comment on function public.resolve_pms_term(bigint, text, text, text, text, integer) is
  'Returns exact and trigram-ranked canonical PMS mapping candidates within the caller RLS scope.';
comment on function public.search_user_memories(bigint, uuid, text, text[], integer) is
  'Returns a small relevance-ranked set of active user memories within the caller RLS scope.';
