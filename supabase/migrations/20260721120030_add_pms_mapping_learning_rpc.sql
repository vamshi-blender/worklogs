create or replace function public.record_pms_mapping_candidate(
  p_tenant_id bigint,
  p_identity_id bigint,
  p_lookup_name text,
  p_field_name text,
  p_alias text,
  p_canonical_value text,
  p_project_key text default '',
  p_source text default 'tool_success',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  mapping_id bigint,
  status text,
  canonical_value text,
  confidence numeric,
  evidence_count integer,
  accepted boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_mapping_id bigint;
  canonical_normalized text;
begin
  if p_source not in ('user_explicit', 'tool_success') then
    raise exception 'Unsupported candidate source';
  end if;

  if not exists (
    select 1
    from public.memory_external_identities identity
    where identity.id = p_identity_id
      and identity.tenant_id = p_tenant_id
  ) then
    raise exception 'Identity does not belong to the tenant';
  end if;

  canonical_normalized :=
    lower(regexp_replace(btrim(p_canonical_value), '\s+', ' ', 'g'));

  insert into public.pms_term_mappings (
    tenant_id,
    lookup_name,
    field_name,
    project_key,
    alias,
    canonical_value,
    status,
    confidence,
    evidence_count,
    source,
    created_by_identity_id,
    metadata
  )
  values (
    p_tenant_id,
    btrim(p_lookup_name),
    btrim(p_field_name),
    btrim(coalesce(p_project_key, '')),
    btrim(p_alias),
    btrim(p_canonical_value),
    'candidate',
    case when p_source = 'user_explicit' then 0.7 else 0.55 end,
    1,
    p_source,
    p_identity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (
    tenant_id,
    lookup_name,
    field_name,
    project_key_normalized,
    alias_normalized
  ) where status in ('candidate', 'verified')
  do update set
    evidence_count =
      public.pms_term_mappings.evidence_count +
      case
        when public.pms_term_mappings.canonical_value_normalized =
             canonical_normalized then 1
        else 0
      end,
    confidence =
      case
        when public.pms_term_mappings.status = 'verified'
          then public.pms_term_mappings.confidence
        when public.pms_term_mappings.canonical_value_normalized =
             canonical_normalized
          then least(0.9, public.pms_term_mappings.confidence + 0.05)
        else public.pms_term_mappings.confidence
      end,
    metadata =
      public.pms_term_mappings.metadata ||
      coalesce(excluded.metadata, '{}'::jsonb) ||
      case
        when public.pms_term_mappings.canonical_value_normalized <>
             canonical_normalized
          then jsonb_build_object(
            'conflicting_candidate', excluded.canonical_value,
            'conflict_observed_at', now()
          )
        else '{}'::jsonb
      end,
    updated_at = now()
  returning id into resolved_mapping_id;

  return query
  select
    mapping.id,
    mapping.status,
    mapping.canonical_value,
    mapping.confidence,
    mapping.evidence_count,
    mapping.canonical_value_normalized = canonical_normalized
  from public.pms_term_mappings mapping
  where mapping.id = resolved_mapping_id;
end;
$$;

revoke all on function public.record_pms_mapping_candidate(
  bigint, bigint, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_pms_mapping_candidate(
  bigint, bigint, text, text, text, text, text, text, jsonb
) to service_role;

comment on function public.record_pms_mapping_candidate(
  bigint, bigint, text, text, text, text, text, text, jsonb
) is
  'Atomically records supporting evidence for an unverified PMS term mapping without overwriting verified facts.';
