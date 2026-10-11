import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLegacyRecords, parseKnowledgeFilters } from "../lib/knowledge-filters.mjs";

function filters(query = "") {
  return parseKnowledgeFilters(new URLSearchParams(query));
}

test("defaults user-facing knowledge queries to verified records", () => {
  assert.equal(filters().filters.verificationStatus, "verified");
});

test("accepts crop, disease, record type, and verification filters together", () => {
  assert.deepEqual(filters("crop=Neem&disease=General&recordType=botanical&verificationStatus=needs_review").filters, {
    crop: "Neem", disease: "General", recordType: "botanical", verificationStatus: "needs_review"
  });
});

test("rejects unsupported record types and statuses", () => {
  assert.equal(filters("recordType=claim").error, "Unsupported knowledge record type.");
  assert.equal(filters("verificationStatus=published").error, "Unsupported knowledge verification status.");
});

test("rejects oversized filter values", () => {
  assert.equal(filters(`crop=${"x".repeat(101)}`).error, "Knowledge filters are too long.");
});

test("normalizes legacy records as needs_review", () => {
  const [record] = normalizeLegacyRecords([{
    id: "legacy", crop_name: "Neem", matched_disease: "General",
    information: "Unreviewed legacy text", created_at: "2026-01-01T00:00:00Z"
  }]);
  assert.equal(record.verification_status, "needs_review");
  assert.equal(record.record_type, "general_crop");
  assert.equal(record.summary, record.information);
});

test("preserves empty results", () => {
  assert.deepEqual(normalizeLegacyRecords([]), []);
});
