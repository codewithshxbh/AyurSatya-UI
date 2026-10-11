-- Additive, rerunnable metadata migration for an existing knowledge_records table.
alter table public.knowledge_records
  add column if not exists normalized_crop text,
  add column if not exists record_type text not null default 'general_crop',
  add column if not exists summary text,
  add column if not exists source_institution text,
  add column if not exists publication_date date,
  add column if not exists source_locator text,
  add column if not exists original_language_text text,
  add column if not exists verified_translation text,
  add column if not exists verification_status text not null default 'needs_review',
  add column if not exists reviewer_notes text,
  add column if not exists source_record_id text,
  add column if not exists updated_at timestamptz not null default now();

update public.knowledge_records
set normalized_crop = coalesce(nullif(normalized_crop, ''), lower(regexp_replace(trim(crop_name), '[^a-z0-9]+', '_', 'g'))),
    summary = coalesce(nullif(summary, ''), information),
    verification_status = coalesce(nullif(verification_status, ''), 'needs_review'),
    updated_at = coalesce(updated_at, created_at, now())
where normalized_crop is null or normalized_crop = '' or summary is null or summary = ''
   or verification_status is null or verification_status = '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'knowledge_records_record_type_check' and conrelid = 'public.knowledge_records'::regclass) then
    alter table public.knowledge_records add constraint knowledge_records_record_type_check
      check (record_type in ('general_crop', 'botanical', 'traditional_reference', 'disease_context')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'knowledge_records_verification_status_check' and conrelid = 'public.knowledge_records'::regclass) then
    alter table public.knowledge_records add constraint knowledge_records_verification_status_check
      check (verification_status in ('verified', 'needs_review', 'rejected')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'knowledge_records_verified_source_check' and conrelid = 'public.knowledge_records'::regclass) then
    alter table public.knowledge_records add constraint knowledge_records_verified_source_check
      check (verification_status <> 'verified' or source_url is not null or source_locator is not null) not valid;
  end if;
end $$;

create unique index if not exists knowledge_records_source_record_id_uidx
  on public.knowledge_records (source_record_id) where source_record_id is not null;
create index if not exists knowledge_records_crop_disease_idx on public.knowledge_records (normalized_crop, matched_disease);
create index if not exists knowledge_records_verification_idx on public.knowledge_records (verification_status, record_type);
create index if not exists knowledge_records_source_url_idx on public.knowledge_records (source_url) where source_url is not null;
alter table public.knowledge_records enable row level security;
