import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { supabaseServer, supabaseServerConfigured } from "../../../lib/supabase";
import { normalizeLegacyRecords, parseKnowledgeFilters } from "../../../lib/knowledge-filters.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!supabaseServerConfigured) {
    return NextResponse.json({ error: "Knowledge base database access is not configured." }, { status: 503 });
  }

  const parsed = parseKnowledgeFilters(new URL(request.url).searchParams);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { crop, disease, recordType, verificationStatus } = parsed.filters;
  let query = supabaseServer
    .from("knowledge_records")
    .select("id,crop_name,normalized_crop,matched_disease,record_type,information,summary,source_title,source_url,source_institution,publication_date,source_locator,original_language_text,verified_translation,verification_status,reviewer_notes,created_at,updated_at");
  if (crop) query = query.eq("crop_name", crop);
  if (disease) query = query.eq("matched_disease", disease);
  if (recordType) query = query.eq("record_type", recordType);
  if (verificationStatus) query = query.eq("verification_status", verificationStatus);
  query = query.order("crop_name", { ascending: true }).order("matched_disease", { ascending: true }).limit(100);

  let { data, error } = await query;
  if (error && (error.code === "42703" || error.message?.toLowerCase().includes("column"))) {
    let legacyQuery = supabaseServer
      .from("knowledge_records")
      .select("id,crop_name,matched_disease,information,source_title,source_url,created_at");
    if (crop) legacyQuery = legacyQuery.eq("crop_name", crop);
    if (disease) legacyQuery = legacyQuery.eq("matched_disease", disease);
    legacyQuery = legacyQuery.order("crop_name", { ascending: true }).order("matched_disease", { ascending: true }).limit(100);
    ({ data, error } = await legacyQuery);
    data = normalizeLegacyRecords(data || []);
    if (recordType && recordType !== "general_crop") data = [];
    if (verificationStatus && verificationStatus !== "needs_review") data = [];
  }
  if (error) {
    console.error("Knowledge base lookup failed", error);
    return NextResponse.json({ error: "Unable to load verified knowledge records." }, { status: 502 });
  }
  return NextResponse.json({ records: data || [] });
}
