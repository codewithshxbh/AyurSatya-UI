export const KNOWLEDGE_RECORD_TYPES = ["general_crop", "botanical", "traditional_reference", "disease_context"];

export function parseKnowledgeFilters(searchParams) {
  const filters = {
    crop: searchParams.get("crop")?.trim() || "",
    disease: searchParams.get("disease")?.trim() || "",
    recordType: searchParams.get("recordType")?.trim() || ""
  };
  if (Object.values(filters).some((value) => value.length > 100)) return { error: "Knowledge filters are too long." };
  if (filters.recordType && !KNOWLEDGE_RECORD_TYPES.includes(filters.recordType)) return { error: "Unsupported knowledge record type." };
  return { filters };
}

export function normalizeLegacyRecords(records) {
  return records.map((record) => ({
    ...record,
    normalized_crop: null,
    record_type: "general_crop",
    summary: record.information,
    source_institution: null,
    publication_date: null,
    source_locator: null,
    original_language_text: null,
    verified_translation: null,
    updated_at: record.created_at
  }));
}
