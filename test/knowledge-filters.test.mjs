import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKnowledgeCrop, normalizeLegacyRecords, parseKnowledgeFilters, selectKnowledgeRecord } from "../lib/knowledge-filters.mjs";

function filters(query = "") {
  return parseKnowledgeFilters(new URLSearchParams(query));
}

test("parses knowledge filters without a verification workflow", () => {
  assert.deepEqual(filters().filters, { crop: "", disease: "", recordType: "" });
});

test("normalizes classifier plant names to database crop keys", () => {
  assert.equal(normalizeKnowledgeCrop("Neem"), "azadirachta_indica");
  assert.equal(normalizeKnowledgeCrop("Tulsi"), "ocimum_tenuiflorum");
  assert.equal(normalizeKnowledgeCrop("Kalanchoe"), "kalanchoe_pinnata");
});

test("prefers disease-specific knowledge and falls back to general", () => {
  const records = [
    { matched_disease: "General", information: "Botanical record" },
    { matched_disease: "Yellow Spot", information: "Disease record", source_title: "Plant Institute", source_institution: "Botanical Research Center", source_url: "https://example.test/source" }
  ];
  const diseaseRecord = selectKnowledgeRecord(records, "Yellow Spot");
  assert.equal(diseaseRecord.information, "Disease record");
  assert.deepEqual(
    { title: diseaseRecord.source_title, institution: diseaseRecord.source_institution, url: diseaseRecord.source_url },
    { title: "Plant Institute", institution: "Botanical Research Center", url: "https://example.test/source" }
  );
  assert.equal(selectKnowledgeRecord(records, "Downy Mildew").information, "Botanical record");
  assert.equal(selectKnowledgeRecord([{ matched_disease: "General" }], "Unknown").matched_disease, "General");
  assert.equal(selectKnowledgeRecord([], "Unknown"), null);
});

test("accepts crop, disease, and record type filters together", () => {
  assert.deepEqual(filters("crop=Neem&disease=General&recordType=botanical").filters, {
    crop: "Neem", disease: "General", recordType: "botanical"
  });
});

test("rejects unsupported record types", () => {
  assert.equal(filters("recordType=claim").error, "Unsupported knowledge record type.");
});

test("rejects oversized filter values", () => {
  assert.equal(filters(`crop=${"x".repeat(101)}`).error, "Knowledge filters are too long.");
});

test("normalizes legacy records without verification fields", () => {
  const [record] = normalizeLegacyRecords([{
    id: "legacy", crop_name: "Neem", matched_disease: "General",
    information: "Legacy botanical text", source_title: "Botanical source",
    source_url: "https://example.com/source", created_at: "2026-01-01T00:00:00Z"
  }]);
  assert.equal(record.record_type, "general_crop");
  assert.equal(record.summary, record.information);
  assert.deepEqual(Object.keys(record).sort(), [
    "created_at", "crop_name", "id", "information", "matched_disease",
    "normalized_crop", "original_language_text", "publication_date",
    "record_type", "source_institution", "source_locator", "source_title",
    "source_url", "summary", "updated_at", "verified_translation"
  ]);
});

test("preserves empty results", () => {
  assert.deepEqual(normalizeLegacyRecords([]), []);
});
