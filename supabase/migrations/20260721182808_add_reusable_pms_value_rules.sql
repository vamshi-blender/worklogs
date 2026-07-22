create table public.pms_value_rules (
  id bigint generated always as identity primary key,
  tenant_id bigint not null
    references public.memory_tenants(id) on delete cascade,
  lookup_name text not null
    check (length(btrim(lookup_name)) between 1 and 120),
  field_name text not null
    check (length(btrim(field_name)) between 1 and 120),
  project_key text not null default '',
  project_key_normalized text generated always as (
    lower(regexp_replace(btrim(project_key), '\s+', ' ', 'g'))
  ) stored,
  input_kind text not null
    check (input_kind in ('digits_only', 'labeled_number')),
  input_label text not null default '',
  input_label_normalized text generated always as (
    lower(regexp_replace(btrim(input_label), '\s+', ' ', 'g'))
  ) stored,
  output_prefix text not null default '',
  output_suffix text not null default '',
  status text not null default 'candidate'
    check (status in ('candidate', 'verified', 'rejected', 'superseded')),
  confidence numeric(4, 3) not null default 0.600
    check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  contradiction_count integer not null default 0
    check (contradiction_count >= 0),
  source text not null default 'tool_success'
    check (source in ('tool_success', 'user_explicit', 'admin', 'import')),
  created_by_identity_id bigint null
    references public.memory_external_identities(id) on delete set null,
  verified_by uuid null references auth.users(id) on delete set null,
  last_verified_at timestamptz null,
  superseded_by bigint null
    references public.pms_value_rules(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pms_value_rules_transformation_check check (
    length(output_prefix) + length(output_suffix) between 1 and 300
  ),
  constraint pms_value_rules_label_check check (
    (input_kind = 'digits_only' and input_label = '')
    or
    (input_kind = 'labeled_number' and length(btrim(input_label)) between 1 and 120)
  ),
  constraint pms_value_rules_verified_check check (
    status <> 'verified' or last_verified_at is not null
  ),
  constraint pms_value_rules_superseded_check check (
    status <> 'superseded' or superseded_by is not null
  ),
  constraint pms_value_rules_no_self_supersede check (
    superseded_by is null or superseded_by <> id
  )
);

create unique index pms_value_rules_active_pattern_uidx
  on public.pms_value_rules (
    tenant_id,
    lookup_name,
    field_name,
    project_key_normalized,
    input_kind,
    input_label_normalized
  )
  where status in ('candidate', 'verified');

create index pms_value_rules_resolution_idx
  on public.pms_value_rules (
    tenant_id,
    lookup_name,
    field_name,
    project_key_normalized,
    status,
    confidence desc
  );

create index pms_value_rules_created_by_identity_idx
  on public.pms_value_rules (created_by_identity_id)
  where created_by_identity_id is not null;

create index pms_value_rules_verified_by_idx
  on public.pms_value_rules (verified_by)
  where verified_by is not null;

create index pms_value_rules_superseded_by_idx
  on public.pms_value_rules (superseded_by)
  where superseded_by is not null;

create table public.pms_value_rule_evidence (
  id bigint generated always as identity primary key,
  tenant_id bigint not null
    references public.memory_tenants(id) on delete cascade,
  rule_id bigint not null
    references public.pms_value_rules(id) on delete cascade,
  identity_id bigint null
    references public.memory_external_identities(id) on delete set null,
  evidence_key text not null
    check (length(btrim(evidence_key)) between 1 and 300),
  outcome text not null check (outcome in ('supported', 'contradicted')),
  example_input text not null check (length(example_input) between 1 and 300),
  example_output text not null check (length(example_output) between 1 and 300),
  source text not null default 'tool_success'
    check (source in ('tool_success', 'user_explicit', 'admin', 'import')),
  created_at timestamptz not null default now(),
  constraint pms_value_rule_evidence_unique unique (rule_id, evidence_key)
);

create index pms_value_rule_evidence_tenant_id_idx
  on public.pms_value_rule_evidence (tenant_id);
create index pms_value_rule_evidence_identity_id_idx
  on public.pms_value_rule_evidence (identity_id)
  where identity_id is not null;

create trigger pms_value_rules_set_updated_at
before update on public.pms_value_rules
for each row execute function memory_private.set_updated_at();

create trigger pms_value_rules_audit
after insert or update or delete on public.pms_value_rules
for each row execute function memory_private.write_audit_log();

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
    when tg_table_name = 'pms_value_rules' then 'pms_value_rule'
    else 'user_memory'
  end;
  record_subject_user_id := nullif(changed_record ->> 'user_id', '')::uuid;

  insert into public.memory_audit_log (
    tenant_id, entity_type, entity_id, subject_user_id, actor_user_id,
    operation, old_record, new_record
  ) values (
    record_tenant_id, record_entity_type, record_id, record_subject_user_id,
    auth.uid(), lower(tg_op), old_record, new_record
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.record_pms_value_rule_observation(
  p_tenant_id bigint,
  p_identity_id bigint,
  p_lookup_name text,
  p_field_name text,
  p_project_key text,
  p_input_kind text,
  p_input_label text,
  p_output_prefix text,
  p_output_suffix text,
  p_example_input text,
  p_example_output text,
  p_evidence_key text,
  p_source text default 'tool_success',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  rule_id bigint,
  status text,
  confidence numeric,
  evidence_count integer,
  contradiction_count integer,
  observation text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_rule_id bigint;
  existing_prefix text;
  existing_suffix text;
  inserted_evidence_count integer := 0;
  observation_outcome text;
begin
  if p_source not in ('tool_success', 'user_explicit') then
    raise exception 'Unsupported rule source';
  end if;

  if p_input_kind not in ('digits_only', 'labeled_number') then
    raise exception 'Unsupported input pattern';
  end if;

  if not exists (
    select 1
    from public.memory_external_identities identity
    where identity.id = p_identity_id
      and identity.tenant_id = p_tenant_id
  ) then
    raise exception 'Identity does not belong to the tenant';
  end if;

  select rule.id, rule.output_prefix, rule.output_suffix
  into resolved_rule_id, existing_prefix, existing_suffix
  from public.pms_value_rules rule
  where rule.tenant_id = p_tenant_id
    and rule.lookup_name = btrim(p_lookup_name)
    and rule.field_name = btrim(p_field_name)
    and rule.project_key_normalized = lower(regexp_replace(btrim(coalesce(p_project_key, '')), '\s+', ' ', 'g'))
    and rule.input_kind = p_input_kind
    and rule.input_label_normalized = lower(regexp_replace(btrim(coalesce(p_input_label, '')), '\s+', ' ', 'g'))
    and rule.status in ('candidate', 'verified')
  for update;

  if resolved_rule_id is null then
    insert into public.pms_value_rules (
      tenant_id, lookup_name, field_name, project_key, input_kind,
      input_label, output_prefix, output_suffix, source,
      created_by_identity_id, metadata
    ) values (
      p_tenant_id, btrim(p_lookup_name), btrim(p_field_name),
      btrim(coalesce(p_project_key, '')), p_input_kind,
      case when p_input_kind = 'digits_only' then '' else btrim(p_input_label) end,
      p_output_prefix, p_output_suffix, p_source, p_identity_id,
      coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict (
      tenant_id, lookup_name, field_name, project_key_normalized,
      input_kind, input_label_normalized
    ) where public.pms_value_rules.status in ('candidate', 'verified')
    do nothing
    returning id, output_prefix, output_suffix
    into resolved_rule_id, existing_prefix, existing_suffix;

    if resolved_rule_id is null then
      select rule.id, rule.output_prefix, rule.output_suffix
      into resolved_rule_id, existing_prefix, existing_suffix
      from public.pms_value_rules rule
      where rule.tenant_id = p_tenant_id
        and rule.lookup_name = btrim(p_lookup_name)
        and rule.field_name = btrim(p_field_name)
        and rule.project_key_normalized = lower(regexp_replace(btrim(coalesce(p_project_key, '')), '\s+', ' ', 'g'))
        and rule.input_kind = p_input_kind
        and rule.input_label_normalized = lower(regexp_replace(btrim(coalesce(p_input_label, '')), '\s+', ' ', 'g'))
        and rule.status in ('candidate', 'verified')
      for update;
    end if;
  end if;

  observation_outcome := case
    when existing_prefix = p_output_prefix and existing_suffix = p_output_suffix
      then 'supported'
    else 'contradicted'
  end;

  insert into public.pms_value_rule_evidence (
    tenant_id, rule_id, identity_id, evidence_key, outcome,
    example_input, example_output, source
  ) values (
    p_tenant_id, resolved_rule_id, p_identity_id, btrim(p_evidence_key),
    observation_outcome, btrim(p_example_input), btrim(p_example_output), p_source
  )
  on conflict (rule_id, evidence_key) do nothing;

  get diagnostics inserted_evidence_count = row_count;

  if inserted_evidence_count > 0 then
    update public.pms_value_rules rule
    set
      evidence_count = rule.evidence_count +
        case when observation_outcome = 'supported' then 1 else 0 end,
      contradiction_count = rule.contradiction_count +
        case when observation_outcome = 'contradicted' then 1 else 0 end,
      confidence = case
        when observation_outcome = 'supported'
          then least(0.950, rule.confidence + 0.100)
        else greatest(0.100, rule.confidence - 0.200)
      end,
      status = case
        when rule.status = 'verified' then rule.status
        when observation_outcome = 'supported'
          and rule.evidence_count + 1 >= 3
          and rule.contradiction_count = 0
          then 'verified'
        else rule.status
      end,
      last_verified_at = case
        when rule.status <> 'verified'
          and observation_outcome = 'supported'
          and rule.evidence_count + 1 >= 3
          and rule.contradiction_count = 0
          then now()
        else rule.last_verified_at
      end,
      metadata = rule.metadata || coalesce(p_metadata, '{}'::jsonb) ||
        case when observation_outcome = 'contradicted'
          then jsonb_build_object(
            'last_conflicting_output', p_example_output,
            'last_conflict_at', now()
          )
          else '{}'::jsonb
        end
    where rule.id = resolved_rule_id;
  end if;

  return query
  select
    rule.id, rule.status, rule.confidence, rule.evidence_count,
    rule.contradiction_count, observation_outcome
  from public.pms_value_rules rule
  where rule.id = resolved_rule_id;
end;
$$;

alter table public.pms_value_rules enable row level security;
alter table public.pms_value_rule_evidence enable row level security;

create policy pms_value_rules_select_member
on public.pms_value_rules for select to authenticated
using (
  exists (
    select 1 from public.memory_tenant_members member
    where member.tenant_id = pms_value_rules.tenant_id
      and member.user_id = (select auth.uid())
  )
);

create policy pms_value_rules_write_admin
on public.pms_value_rules for all to authenticated
using (
  exists (
    select 1 from public.memory_tenant_members member
    where member.tenant_id = pms_value_rules.tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.memory_tenant_members member
    where member.tenant_id = pms_value_rules.tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  )
);

create policy pms_value_rule_evidence_select_admin
on public.pms_value_rule_evidence for select to authenticated
using (
  exists (
    select 1 from public.memory_tenant_members member
    where member.tenant_id = pms_value_rule_evidence.tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  )
);

revoke all on table public.pms_value_rules, public.pms_value_rule_evidence
from public, anon;
grant select, insert, update, delete on public.pms_value_rules to authenticated;
grant select on public.pms_value_rule_evidence to authenticated;
grant all on table public.pms_value_rules, public.pms_value_rule_evidence
to service_role;
grant usage, select on sequence
  public.pms_value_rules_id_seq,
  public.pms_value_rule_evidence_id_seq
to service_role;

revoke all on function public.record_pms_value_rule_observation(
  bigint, bigint, text, text, text, text, text, text, text,
  text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_pms_value_rule_observation(
  bigint, bigint, text, text, text, text, text, text, text,
  text, text, text, text, jsonb
) to service_role;

comment on table public.pms_value_rules is
  'Tenant-scoped reusable, evidence-backed transformations for PMS filter values.';
comment on table public.pms_value_rule_evidence is
  'Deduplicated evidence used to validate or contradict reusable PMS value rules.';
