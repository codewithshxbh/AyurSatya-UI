-- Review manually before running. Requires 003_knowledge_metadata.sql.
-- No disease, treatment, dosage, efficacy, or safety claims are included.
begin;
create temporary table ayursatya_knowledge_seed (
  source_record_id text primary key, crop_name text not null, normalized_crop text not null,
  matched_disease text not null, record_type text not null, summary text not null,
  information text not null, source_title text not null, source_url text not null,
  source_institution text not null, publication_date date, source_locator text not null,
  original_language_text text, verified_translation text, verification_status text not null,
  reviewer_notes text not null
) on commit drop;

insert into ayursatya_knowledge_seed values
('kew-powo-azadirachta-indica-botanical-2026', 'Neem', 'azadirachta_indica', 'General', 'botanical',
 'Kew lists Azadirachta indica A.Juss. as an accepted species in Meliaceae, native from Assam to Indo-China.',
 'Botanical identity and distribution only; this is not disease, treatment, safety, or efficacy evidence.',
 'Azadirachta indica A.Juss. | Plants of the World Online', 'https://powo.science.kew.org/taxon/1213180-2',
 'Kew Science, Royal Botanic Gardens, Kew', null, 'Taxonomy, accepted name, family, and distribution sections',
 null, null, 'verified', 'Reviewed against the Kew POWO record on 2026-10-11.'),
('kew-powo-ocimum-tenuiflorum-botanical-2026', 'Tulsi', 'ocimum_tenuiflorum', 'General', 'botanical',
 'Kew lists Ocimum tenuiflorum L. as an accepted species in Lamiaceae, native from Tropical and Subtropical Asia to the Western Pacific; Ocimum sanctum is a synonym.',
 'Botanical identity, synonym, and distribution only; this is not disease, treatment, safety, or efficacy evidence.',
 'Ocimum tenuiflorum L. | Plants of the World Online', 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:453130-1',
 'Kew Science, Royal Botanic Gardens, Kew', null, 'Taxonomy, accepted name, synonym, family, and distribution sections',
 null, null, 'verified', 'Reviewed against the Kew POWO record on 2026-10-11.'),
('kew-powo-kalanchoe-pinnata-botanical-2026', 'Kalanchoe pinnata', 'kalanchoe_pinnata', 'General', 'botanical',
 'Kew lists Kalanchoe pinnata (Lam.) Pers. as an accepted species in Crassulaceae, native to Madagascar and mainly occurring in seasonally dry tropical biomes.',
 'Botanical identity and distribution only; this is not disease, treatment, safety, or efficacy evidence.',
 'Kalanchoe pinnata (Lam.) Pers. | Plants of the World Online', 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:274438-1',
 'Kew Science, Royal Botanic Gardens, Kew', null, 'Taxonomy, accepted name, family, native range, and biome sections',
 null, null, 'verified', 'Reviewed against the Kew POWO record on 2026-10-11.');

do $$
declare inserted_count integer; updated_count integer; skipped_count integer; rejected_count integer;
begin
  select count(*) into inserted_count from ayursatya_knowledge_seed s
  where not exists (select 1 from public.knowledge_records r where r.source_record_id = s.source_record_id);
  select count(*) into updated_count from ayursatya_knowledge_seed s
  join public.knowledge_records r on r.source_record_id = s.source_record_id
  where row(r.crop_name, r.normalized_crop, r.matched_disease, r.record_type, r.summary, r.information, r.source_title, r.source_url, r.source_institution, r.publication_date, r.source_locator, r.original_language_text, r.verified_translation)
    is distinct from row(s.crop_name, s.normalized_crop, s.matched_disease, s.record_type, s.summary, s.information, s.source_title, s.source_url, s.source_institution, s.publication_date, s.source_locator, s.original_language_text, s.verified_translation);
  select count(*) into skipped_count from ayursatya_knowledge_seed s
  join public.knowledge_records r on r.source_record_id = s.source_record_id
  where row(r.crop_name, r.normalized_crop, r.matched_disease, r.record_type, r.summary, r.information, r.source_title, r.source_url, r.source_institution, r.publication_date, r.source_locator, r.original_language_text, r.verified_translation)
    is not distinct from row(s.crop_name, s.normalized_crop, s.matched_disease, s.record_type, s.summary, s.information, s.source_title, s.source_url, s.source_institution, s.publication_date, s.source_locator, s.original_language_text, s.verified_translation);
  select count(*) into rejected_count from ayursatya_knowledge_seed
  where verification_status not in ('verified', 'needs_review', 'rejected')
     or (verification_status = 'verified' and source_url is null and source_locator is null);

  update public.knowledge_records target set
    crop_name = seed.crop_name, normalized_crop = seed.normalized_crop, matched_disease = seed.matched_disease,
    record_type = seed.record_type, summary = seed.summary, information = seed.information,
    source_title = seed.source_title, source_url = seed.source_url, source_institution = seed.source_institution,
    publication_date = seed.publication_date, source_locator = seed.source_locator,
    original_language_text = seed.original_language_text, verified_translation = seed.verified_translation, updated_at = now()
  from ayursatya_knowledge_seed seed
  where target.source_record_id = seed.source_record_id
    and row(target.crop_name, target.normalized_crop, target.matched_disease, target.record_type, target.summary, target.information, target.source_title, target.source_url, target.source_institution, target.publication_date, target.source_locator, target.original_language_text, target.verified_translation)
      is distinct from row(seed.crop_name, seed.normalized_crop, seed.matched_disease, seed.record_type, seed.summary, seed.information, seed.source_title, seed.source_url, seed.source_institution, seed.publication_date, seed.source_locator, seed.original_language_text, seed.verified_translation);

  insert into public.knowledge_records (source_record_id, crop_name, normalized_crop, matched_disease, record_type, summary, information, source_title, source_url, source_institution, publication_date, source_locator, original_language_text, verified_translation, verification_status, reviewer_notes)
  select source_record_id, crop_name, normalized_crop, matched_disease, record_type, summary, information, source_title, source_url, source_institution, publication_date, source_locator, original_language_text, verified_translation, verification_status, reviewer_notes
  from ayursatya_knowledge_seed seed
  where not exists (select 1 from public.knowledge_records existing where existing.source_record_id = seed.source_record_id);
  raise notice 'Knowledge seed: % inserted, % updated, % skipped, % rejected. Existing verification_status and reviewer_notes were preserved.', inserted_count, updated_count, skipped_count, rejected_count;
end $$;
commit;
