import test from "node:test";
import assert from "node:assert/strict";
import {
  clipHighlightSummary,
  getPublicHighlight,
  pickDailyHighlight,
  presentPublicHighlight
} from "../lib/public-highlight.js";

function mockClient({ count = 0, countError = null, data = [], error = null } = {}) {
  return {
    from(table) {
      assert.equal(table, "knowledge_records");
      const builder = {
        select(columns, options) {
          builder.columns = columns;
          builder.options = options;
          if (options?.head) {
            return Promise.resolve({ count, error: countError, data: null });
          }
          return builder;
        },
        limit(value) {
          builder.limitValue = value;
          return Promise.resolve({ data, error });
        }
      };
      return builder;
    }
  };
}

test("daily highlight rotates through database records", () => {
  const records = [{ crop_name: "Neem" }, { crop_name: "Tulsi" }, { crop_name: "Kalanchoe" }];
  assert.equal(pickDailyHighlight(records, 0).crop_name, "Neem");
  assert.equal(pickDailyHighlight(records, 86400000).crop_name, "Tulsi");
  assert.equal(pickDailyHighlight([], 0), null);
});

test("highlight presentation uses sourced summary text", () => {
  const presented = presentPublicHighlight({
    crop_name: "Kalanchoe pinnata",
    summary: "Kew lists Kalanchoe pinnata as an accepted species.",
    source_title: "Kew Plants of the World Online"
  }, 18);
  assert.equal(presented.knowledgeCount, 18);
  assert.equal(presented.highlight.cropName, "Kalanchoe pinnata");
  assert.match(presented.highlight.summary, /Kew lists Kalanchoe pinnata/);
  assert.equal(presented.highlight.sourceTitle, "Kew Plants of the World Online");
});

test("long summaries are clipped without inventing text", () => {
  const summary = `${"Kew note. ".repeat(80)}Final sentence stays sourced.`;
  const clipped = clipHighlightSummary(summary);
  assert.equal(clipped.includes("Kew note"), true);
  assert.equal(clipped.length <= 360, true);
});

test("public highlight reads knowledge_records and returns a count", async () => {
  const client = mockClient({
    count: 18,
    data: [
      { crop_name: "Neem", summary: "Neem botanical note.", record_type: "botanical" },
      { crop_name: "Tulsi", summary: "Tulsi botanical note.", record_type: "traditional_reference" }
    ]
  });
  const result = await getPublicHighlight(client);
  assert.equal(result.knowledgeCount, 18);
  assert.equal(result.highlight.cropName, "Neem");
  assert.equal(result.highlight.summary, "Neem botanical note.");
});
