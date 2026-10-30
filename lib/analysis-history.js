export const ANALYSIS_LIST_LIMIT = 20;
export const ANALYSIS_LIST_COLUMNS = "id,crop_name,image_path,created_at";
export const ANALYSIS_DETAIL_COLUMNS = "id,crop_name,image_path,result,created_at";

export function isStatementTimeout(error) {
  if (!error) return false;
  return error.code === "57014" || /statement timeout/i.test(String(error.message || ""));
}

export function isAnalysisId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function presentAnalysisListRow(row = {}) {
  return {
    id: row.id,
    crop_name: row.crop_name,
    image_path: row.image_path || null,
    created_at: row.created_at,
    result: {
      visual: {
        crop: row.crop_name || null,
        condition: null,
        disease: null,
        confidence: null
      },
      imageUrl: row.image_path || null
    }
  };
}

export function presentAnalysisDetail(row = {}) {
  const result = row.result && typeof row.result === "object" ? row.result : {};
  return {
    id: row.id,
    crop_name: row.crop_name,
    image_path: row.image_path || null,
    created_at: row.created_at,
    result
  };
}

const COUNT_BUDGET_MS = 2500;

export async function loadAnalysisHistory(client, userId, { limit = ANALYSIS_LIST_LIMIT } = {}) {
  const listPromise = client
    .from("analyses")
    .select(ANALYSIS_LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  let countTimer;
  const countPromise = Promise.race([
    client.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", userId),
    new Promise((resolve) => {
      countTimer = setTimeout(() => resolve({ timedOut: true }), COUNT_BUDGET_MS);
    })
  ]);
  const [{ data, error }, counted] = await Promise.all([listPromise, countPromise]);
  clearTimeout(countTimer);
  if (error) {
    return {
      analyses: [],
      total: 0,
      validated: 0,
      error,
      timeout: isStatementTimeout(error)
    };
  }
  const analyses = (data || []).map(presentAnalysisListRow);
  const countedTotal = !counted?.timedOut && !counted?.error && Number.isFinite(counted.count) ? counted.count : null;
  const total = countedTotal ?? analyses.length;
  return {
    analyses,
    total,
    validated: total,
    error: null,
    timeout: false
  };
}

export async function loadAnalysisDetail(client, userId, analysisId) {
  if (!isAnalysisId(analysisId)) {
    return { analysis: null, error: { message: "A valid analysis id is required." }, status: 400 };
  }
  const { data, error } = await client
    .from("analyses")
    .select(ANALYSIS_DETAIL_COLUMNS)
    .eq("id", analysisId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return {
      analysis: null,
      error,
      timeout: isStatementTimeout(error),
      status: isStatementTimeout(error) ? 503 : 500
    };
  }
  if (!data) return { analysis: null, error: { message: "Analysis not found." }, status: 404 };
  return { analysis: presentAnalysisDetail(data), error: null, status: 200 };
}
