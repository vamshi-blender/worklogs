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
