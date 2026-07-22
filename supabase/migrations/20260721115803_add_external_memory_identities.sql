create table public.memory_external_identities (
  id bigint generated always as identity primary key,
  tenant_id bigint not null
    references public.memory_tenants(id) on delete cascade,
  provider text not null,
  external_tenant_id text not null,
  external_user_id text not null,
  display_name text not null default '',
  email text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_external_identities_provider_check
    check (provider in ('pms')),
  constraint memory_external_identities_external_tenant_id_check
    check (
      length(btrim(external_tenant_id)) between 1 and 300
    ),
  constraint memory_external_identities_external_user_id_check
    check (
      length(btrim(external_user_id)) between 1 and 300
    ),
  constraint memory_external_identities_display_name_check
    check (length(display_name) <= 300),
  constraint memory_external_identities_email_check
    check (length(email) <= 320),
  constraint memory_external_identities_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint memory_external_identities_provider_user_key
    unique (provider, external_tenant_id, external_user_id)
);

create index memory_external_identities_tenant_id_idx
  on public.memory_external_identities (tenant_id);

alter table public.pms_term_mappings
  add column created_by_identity_id bigint null
    references public.memory_external_identities(id) on delete set null;

create index pms_term_mappings_created_by_identity_id_idx
  on public.pms_term_mappings (created_by_identity_id)
  where created_by_identity_id is not null;

create trigger memory_external_identities_set_updated_at
before update on public.memory_external_identities
for each row execute function memory_private.set_updated_at();

alter table public.memory_external_identities enable row level security;

revoke all on table public.memory_external_identities
  from public, anon, authenticated;
grant all on table public.memory_external_identities to service_role;
grant usage, select on sequence public.memory_external_identities_id_seq
  to service_role;

create or replace function public.resolve_external_memory_identity(
  p_provider text,
  p_external_tenant_id text,
  p_external_user_id text,
  p_tenant_name text,
  p_display_name text default '',
  p_email text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  tenant_id bigint,
  identity_id bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_tenant_id bigint;
  resolved_identity_id bigint;
  tenant_slug text;
begin
  if p_provider <> 'pms' then
    raise exception 'Unsupported external identity provider';
  end if;

  if length(btrim(p_external_tenant_id)) = 0
     or length(btrim(p_external_user_id)) = 0 then
    raise exception 'External tenant and user identifiers are required';
  end if;

  tenant_slug :=
    p_provider || '-' ||
    substr(
      encode(
        extensions.digest(
          convert_to(btrim(p_external_tenant_id), 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      1,
      24
    );

  insert into public.memory_tenants (name, slug)
  values (
    left(coalesce(nullif(btrim(p_tenant_name), ''), 'PMS organization'), 120),
    tenant_slug
  )
  on conflict (slug) do update
  set
    name = excluded.name,
    updated_at = now()
  returning id into resolved_tenant_id;

  insert into public.memory_external_identities (
    tenant_id,
    provider,
    external_tenant_id,
    external_user_id,
    display_name,
    email,
    metadata,
    last_seen_at
  )
  values (
    resolved_tenant_id,
    p_provider,
    btrim(p_external_tenant_id),
    btrim(p_external_user_id),
    left(coalesce(p_display_name, ''), 300),
    left(coalesce(p_email, ''), 320),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (provider, external_tenant_id, external_user_id) do update
  set
    tenant_id = excluded.tenant_id,
    display_name = excluded.display_name,
    email = excluded.email,
    metadata = public.memory_external_identities.metadata || excluded.metadata,
    last_seen_at = now(),
    updated_at = now()
  returning id into resolved_identity_id;

  return query
  select resolved_tenant_id, resolved_identity_id;
end;
$$;

revoke all on function public.resolve_external_memory_identity(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.resolve_external_memory_identity(
  text, text, text, text, text, text, jsonb
) to service_role;

comment on table public.memory_external_identities is
  'Server-validated external identities mapped to internal memory tenants.';
comment on function public.resolve_external_memory_identity(
  text, text, text, text, text, text, jsonb
) is
  'Atomically resolves a validated external identity; executable only by service_role.';
