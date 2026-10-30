import { humanizeUserText } from "./prediction-result.js";

export const KNOWLEDGE_RECORD_TYPES = ["general_crop", "botanical", "traditional_reference", "disease_context"];
export const KNOWLEDGE_CROP_KEYS = {
  neem: "azadirachta_indica",
  tulsi: "ocimum_tenuiflorum",
  kalanchoe: "kalanchoe_pinnata"
};

export function normalizeKnowledgeCrop(cropName) {
  return KNOWLEDGE_CROP_KEYS[cropName?.trim().toLowerCase()] || cropName?.trim().toLowerCase().replace(/\s+/g, "_") || "";
}

export function selectKnowledgeRecord(records, disease, recordType) {
  const requestedDisease = disease?.trim().toLowerCase();
  const typed = recordType
    ? records.filter((record) => record.record_type === recordType)
    : records;
  if (requestedDisease) {
    const diseaseMatch = typed.find((record) => record.matched_disease?.trim().toLowerCase() === requestedDisease);
    if (diseaseMatch) return diseaseMatch;
  }
  if (recordType === "disease_context") return null;
  if (recordType && requestedDisease && requestedDisease !== "general") return null;
  return typed.find((record) => record.matched_disease?.trim().toLowerCase() === "general") || null;
}

export function parseLabeledInformation(text) {
  if (typeof text !== "string" || !text.trim()) return { fields: {}, description: "" };
  const fields = {};
  const unused = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z ]{1,40}):\s*(.+)$/);
    if (match) fields[match[1].trim()] = match[2].trim();
    else if (line.trim()) unused.push(line.trim());
  }
  return { fields, description: unused.join(" ") };
}

export function combineKnowledgeText(record) {
  const information = typeof record?.information === "string" ? record.information.trim() : "";
  const summary = typeof record?.summary === "string" ? record.summary.trim() : "";
  if (!summary) return information;
  if (!information) return summary;
  if (information === summary) return information;
  if (information.includes(summary)) return information;
  if (summary.includes(information)) return summary;
  const infoFields = Object.keys(parseLabeledInformation(information).fields).length;
  if (infoFields > 0) return information;
  return `${summary}\n\n${information}`;
}

export function emptyKnowledgeSection(status, message) {
  return {
    status,
    information: message,
    summary: message,
    source: null,
    sourceInstitution: null,
    sourceUrl: null,
    matchedDisease: null,
    recordType: null
  };
}

export function presentKnowledgeRecord(record, status) {
  if (!record) return emptyKnowledgeSection(status, "No matching knowledge record is available.");
  const information = humanizeUserText(combineKnowledgeText(record));
  return {
    status,
    information,
    summary: humanizeUserText(record.summary || record.information),
    source: record.source_title || null,
    sourceInstitution: record.source_institution || null,
    sourceUrl: record.source_url || null,
    matchedDisease: humanizeUserText(record.matched_disease || null),
    recordType: record.record_type || null,
    cropName: humanizeUserText(record.crop_name || null),
    sourceLocator: record.source_locator || null,
    fields: parseLabeledInformation(information).fields
  };
}

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
