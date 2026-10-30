import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_DETAIL_COLUMNS,
  ANALYSIS_LIST_COLUMNS,
  isAnalysisId,
  isStatementTimeout,
  loadAnalysisDetail,
  loadAnalysisHistory,
  presentAnalysisListRow
} from "../lib/analysis-history.js";

function mockClient(result, captured = {}) {
  const builder = {
    select(columns, options) {
      captured.select = columns;
      captured.options = options;
      captured.selects = captured.selects || [];
      captured.selects.push({ columns, options });
      return builder;
    },
    eq(column, value) {
      captured.filters = captured.filters || [];
      captured.filters.push([column, value]);
      return builder;
    },
    order(column, options) {
      captured.order = { column, options };
      return builder;
    },
    limit(value) {
      captured.limit = value;
      return builder;
    },
    maybeSingle() {
      captured.maybeSingle = true;
      return result;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    }
  };
  return {
    from(table) {
      captured.table = table;
      return builder;
    },
    captured
  };
}

test("list query never selects the JSONB result column", () => {
  assert.equal(ANALYSIS_LIST_COLUMNS.includes("result"), false);
  assert.equal(ANALYSIS_DETAIL_COLUMNS.includes("result"), true);
});

test("statement timeout detection matches Postgres 57014", () => {
  assert.equal(isStatementTimeout({ code: "57014", message: "canceling statement due to statement timeout" }), true);
  assert.equal(isStatementTimeout({ code: "42501", message: "permission denied" }), false);
});

test("analysis ids must be UUIDs", () => {
  assert.equal(isAnalysisId("3f1c0a7e-2b8d-4a11-9c4e-1d2f3a4b5c6d"), true);
  assert.equal(isAnalysisId("not-an-id"), false);
});

test("list rows use crop_name without loading heatmaps", () => {
  const row = presentAnalysisListRow({
    id: "a",
    crop_name: "Neem",
    image_path: "https://cdn.example/leaf.jpg",
    created_at: "2026-10-30T00:00:00.000Z",
    result: { visual: { explainability: { heatmap: "data:image/png;base64,AAAA" } } }
  });
  assert.equal(row.result.visual.crop, "Neem");
  assert.equal(row.result.imageUrl, "https://cdn.example/leaf.jpg");
  assert.equal(row.result.visual.explainability, undefined);
});

test("history lookup uses a light list query and maps timeouts", async () => {
  const captured = {};
  const client = mockClient({
    data: [{ id: "a", crop_name: "Tulsi", image_path: null, created_at: "2026-10-30T00:00:00.000Z" }],
    count: 1,
    error: null
  }, captured);
  const loaded = await loadAnalysisHistory(client, "user-1");
  assert.equal(captured.table, "analyses");
  assert.equal(captured.selects[0].columns, ANALYSIS_LIST_COLUMNS);
  assert.equal(captured.selects[0].options, undefined);
  assert.deepEqual(captured.filters, [["user_id", "user-1"], ["user_id", "user-1"]]);
  assert.equal(captured.limit, 20);
  assert.equal(loaded.total, 1);
  assert.equal(loaded.validated, 1);
  assert.equal(loaded.analyses[0].crop_name, "Tulsi");
  assert.equal(loaded.timeout, false);

  const timeoutClient = mockClient({
    data: null,
    count: null,
    error: { code: "57014", message: "canceling statement due to statement timeout" }
  });
  const timedOut = await loadAnalysisHistory(timeoutClient, "user-1");
  assert.equal(timedOut.timeout, true);
  assert.equal(timedOut.analyses.length, 0);
});

test("detail lookup is scoped to the current user", async () => {
  const captured = {};
  const id = "3f1c0a7e-2b8d-4a11-9c4e-1d2f3a4b5c6d";
  const client = mockClient({
    data: {
      id,
      crop_name: "Kalanchoe",
      image_path: null,
      created_at: "2026-10-30T00:00:00.000Z",
      result: { visual: { crop: "Kalanchoe", condition: "Healthy" } }
    },
    error: null
  }, captured);
  const loaded = await loadAnalysisDetail(client, "user-1", id);
  assert.deepEqual(captured.filters, [["id", id], ["user_id", "user-1"]]);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.analysis.result.visual.condition, "Healthy");
});
