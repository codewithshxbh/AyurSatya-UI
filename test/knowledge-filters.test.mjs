import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLegacyRecords, parseKnowledgeFilters } from "../lib/knowledge-filters.mjs";

function filters(query = "") {
  return parseKnowledgeFilters(new URLSearchParams(query));
}

test("parses knowledge filters without a verification workflow", () => {
  assert.deepEqual(filters().filters, { crop: "", disease: "", recordType: "" });
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
