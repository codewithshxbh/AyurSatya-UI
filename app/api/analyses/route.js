import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { loadAnalysisHistory } from "../../../lib/analysis-history";
import { supabaseServer } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const loaded = await loadAnalysisHistory(supabaseServer, user.id);
  if (loaded.error) {
    console.error("Analysis history lookup failed", loaded.error);
    return NextResponse.json(
      { error: loaded.timeout ? "Analysis history is taking too long to load. Try again." : "Unable to load analysis history." },
      { status: loaded.timeout ? 503 : 500 }
    );
  }
  return NextResponse.json({
    analyses: loaded.analyses,
    total: loaded.total,
    validated: loaded.validated
  });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body with the analysis result." }, { status: 400 });
  }
  const { imagePath, result } = input;
  const detectedCrop = result?.visual?.crop;
  const cropName = detectedCrop || input.cropName;
  if (!cropName || !result) return NextResponse.json({ error: "A detected crop and result are required." }, { status: 400 });
  const { data, error } = await supabaseServer
    .from("analyses")
    .insert({ user_id: user.id, crop_name: cropName, image_path: imagePath || null, result })
    .select("id,crop_name,image_path,result,created_at")
    .single();
  if (error) {
    console.error("Analysis save failed", error);
    return NextResponse.json({ error: "Unable to save analysis." }, { status: 500 });
  }
  return NextResponse.json({ analysis: data }, { status: 201 });
}
