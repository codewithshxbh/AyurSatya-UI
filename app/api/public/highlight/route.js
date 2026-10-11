import { NextResponse } from "next/server";
import { supabaseServer, supabaseServerConfigured } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseServerConfigured) {
    return NextResponse.json({ highlight: null });
  }

  let { data, error } = await supabaseServer
    .from("knowledge_records")
    .select("crop_name,summary,source_title")
    .order("crop_name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && (error.code === "42703" || error.message?.toLowerCase().includes("column"))) {
    ({ data, error } = await supabaseServer
      .from("knowledge_records")
      .select("crop_name,information,source_title")
      .order("crop_name", { ascending: true })
      .limit(1)
      .maybeSingle());
    if (data) {
      data = { ...data, summary: data.information };
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
          summary: data.summary || "Verified botanical information is available in the knowledge base.",
          sourceTitle: data.source_title || null
        }
      : null
  });
}
