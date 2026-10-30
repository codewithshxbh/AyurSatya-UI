import { supabaseServer, supabaseServerConfigured } from "./supabase.js";

const HIGHLIGHT_COLUMNS = "crop_name,summary,information,source_title,source_institution,source_url,record_type,matched_disease";
const LEGACY_COLUMNS = "crop_name,information,source_title,source_url";
const HIGHLIGHT_LIMIT = 24;
const SUMMARY_MAX_CHARS = 360;

export function clipHighlightSummary(value) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (text.length <= SUMMARY_MAX_CHARS) return text || null;
  const clipped = text.slice(0, SUMMARY_MAX_CHARS);
  const sentence = clipped.lastIndexOf(".");
  if (sentence >= 120) return clipped.slice(0, sentence + 1).trim();
  return `${clipped.replace(/\s+\S*$/, "").trim()}...`;
}

export function presentPublicHighlight(row, knowledgeCount = 0) {
  if (!row) {
    return { highlight: null, knowledgeCount };
  }
  return {
    highlight: {
      cropName: row.crop_name || null,
      summary: clipHighlightSummary(row.summary || row.information),
      sourceTitle: row.source_title || null,
      sourceInstitution: row.source_institution || null,
      sourceUrl: row.source_url || null
    },
    knowledgeCount
  };
}

export function pickDailyHighlight(records, now = Date.now()) {
  if (!Array.isArray(records) || !records.length) return null;
  const day = Math.floor(now / 86400000);
  return records[day % records.length];
}

function isMissingColumnError(error) {
  return Boolean(error && (error.code === "42703" || String(error.message || "").toLowerCase().includes("column")));
}

export async function getPublicHighlight(client = supabaseServer) {
  if (!client) return { highlight: null, knowledgeCount: 0 };

  const counted = await client.from("knowledge_records").select("id", { count: "exact", head: true });
  const knowledgeCount = Number.isFinite(counted.count) ? counted.count : 0;
  if (counted.error) {
    console.error("Public knowledge count failed", counted.error);
  }

  let query = await client.from("knowledge_records").select(HIGHLIGHT_COLUMNS).limit(HIGHLIGHT_LIMIT);
  if (isMissingColumnError(query.error)) {
    query = await client.from("knowledge_records").select(LEGACY_COLUMNS).limit(HIGHLIGHT_LIMIT);
  }
  if (query.error) {
    console.error("Public knowledge highlight lookup failed", query.error);
    return { highlight: null, knowledgeCount };
  }

  const records = query.data || [];
  const botanical = records.filter((row) => !row.record_type || row.record_type === "botanical");
  const pool = botanical.length ? botanical : records;
  return presentPublicHighlight(pickDailyHighlight(pool), knowledgeCount);
}

export async function loadPublicHighlight() {
  if (!supabaseServerConfigured) return { highlight: null, knowledgeCount: 0 };
  return getPublicHighlight(supabaseServer);
}
