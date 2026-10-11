import { NextResponse } from "next/server";
import { supabaseServer, supabaseServerConfigured } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseServerConfigured) {
    return NextResponse.json({ highlight: null });
  }

  let { data, error } = await supabaseServer
    .from("knowledge_records")
    .select("crop_name,summary,information,source_title,source_institution,source_url")
    .order("crop_name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && (error.code === "42703" || error.message?.toLowerCase().includes("column"))) {
    ({ data, error } = await supabaseServer
      .from("knowledge_records")
      .select("crop_name,information,source_title,source_url")
      .order("crop_name", { ascending: true })
      .limit(1)
      .maybeSingle());
    if (data) {
      data = { ...data, summary: data.information, source_institution: null };
    }
  }

  if (error) {
    console.error("Public knowledge highlight lookup failed", error);
    return NextResponse.json({ highlight: null });
  }

  return NextResponse.json({
    highlight: data
      ? {
          cropName: data.crop_name,
          summary: data.summary || data.information || null,
          sourceTitle: data.source_title || null,
          sourceInstitution: data.source_institution || null,
          sourceUrl: data.source_url || null
        }
      : null
  });
}
