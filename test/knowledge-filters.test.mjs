import test from "node:test";
import assert from "node:assert/strict";
import { combineKnowledgeText, normalizeKnowledgeCrop, normalizeLegacyRecords, parseKnowledgeFilters, parseLabeledInformation, presentKnowledgeRecord, selectKnowledgeRecord } from "../lib/knowledge-filters.mjs";

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

test("proposed seed retrieval keys match exact crop tokens and disease labels", async () => {
  const { parsePredictedClass } = await import("../lib/prediction-result.js");
  assert.equal(parsePredictedClass("Neem_Spot").crop, "Neem");
  assert.equal(parsePredictedClass("Neem_Spot").condition, "Spot");
  assert.equal(parsePredictedClass("Neem_Web_Blight").condition, "Web Blight");
  assert.equal(parsePredictedClass("Tulsi_Downy_Mildew").condition, "Downy Mildew");
  assert.equal(parsePredictedClass("Kalanchoe_Healthy").crop, "Kalanchoe");
  assert.equal(normalizeKnowledgeCrop(parsePredictedClass("Kalanchoe_Healthy").crop), "kalanchoe_pinnata");
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

test("typed disease lookup never returns a different disease or crop record", () => {
  const records = [
    { record_type: "botanical", matched_disease: "General", information: "Neem botanical" },
    { record_type: "disease_context", matched_disease: "Spot", information: "Neem spot" },
    { record_type: "disease_context", matched_disease: "Web Blight", information: "Neem web blight" }
  ];
  assert.equal(selectKnowledgeRecord(records, "Spot", "disease_context").information, "Neem spot");
  assert.equal(selectKnowledgeRecord(records, "Downy Mildew", "disease_context"), null);
  assert.equal(selectKnowledgeRecord(records, "General", "botanical").information, "Neem botanical");
  assert.equal(selectKnowledgeRecord(records, "Spot", "botanical"), null);
});

test("healthy predictions can still use a botanical general profile", () => {
  const records = [{ record_type: "botanical", matched_disease: "General", information: "Tulsi profile" }];
  assert.equal(selectKnowledgeRecord(records, "General", "botanical").information, "Tulsi profile");
  assert.equal(selectKnowledgeRecord(records, "Healthy", "disease_context"), null);
});

test("disease_context never falls back to a General disease record", () => {
  const records = [
    { record_type: "disease_context", matched_disease: "General", information: "generic disease" },
    { record_type: "disease_context", matched_disease: "Spot", information: "Neem spot" }
  ];
  assert.equal(selectKnowledgeRecord(records, "Yellow", "disease_context"), null);
  assert.equal(selectKnowledgeRecord(records, "Spot", "disease_context").information, "Neem spot");
});

test("presents knowledge text without dataset class underscores", () => {
  const presented = presentKnowledgeRecord({
    information: "Classification status: The model predicted the Downy_Mildew class.",
    summary: "Tulsi_Downy_Mildew context",
    matched_disease: "Tulsi_Downy_Mildew",
    crop_name: "ocimum_tenuiflorum",
    record_type: "disease_context",
    source_title: "Resistance Against Basil Downy Mildew"
  }, "available");
  assert.equal(presented.information, "Classification status: The model predicted the Downy Mildew class.");
  assert.equal(presented.summary, "Tulsi Downy Mildew context");
  assert.equal(presented.matchedDisease, "Tulsi Downy Mildew");
  assert.equal(presented.cropName, "ocimum tenuiflorum");
});

test("botanical presentation includes the stored summary when information is only a disclaimer", () => {
  const combined = combineKnowledgeText({
    information: "Botanical identity, synonym, and distribution only; this record does not make a disease, treatment, safety, or efficacy claim.",
    summary: "Kew lists Ocimum tenuiflorum L. as an accepted species in the family Lamiaceae, native from Tropical and Subtropical Asia to the Western Pacific; Ocimum sanctum is listed as a synonym."
  });
  assert.match(combined, /Ocimum tenuiflorum L/);
  assert.match(combined, /Botanical identity, synonym, and distribution only/);
  const presented = presentKnowledgeRecord({
    information: "Botanical identity, synonym, and distribution only; this record does not make a disease, treatment, safety, or efficacy claim.",
    summary: "Kew lists Ocimum tenuiflorum L. as an accepted species in the family Lamiaceae.",
    matched_disease: "General",
    crop_name: "Tulsi",
    record_type: "botanical"
  }, "available");
  assert.match(presented.information, /Kew lists Ocimum tenuiflorum L/);
  assert.match(presented.information, /Botanical identity, synonym, and distribution only/);
});

test("parses labeled knowledge fields without dropping unmatched text", () => {
  const parsed = parseLabeledInformation("Common name: Neem\nScientific name: Azadirachta indica\nThis is extra description.");
  assert.equal(parsed.fields["Common name"], "Neem");
  assert.equal(parsed.fields["Scientific name"], "Azadirachta indica");
  assert.equal(parsed.description, "This is extra description.");
});
