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

revoke all on function memory_private.write_audit_log() from public, anon, authenticated;
