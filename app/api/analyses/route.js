import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";
import { supabaseServer } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await supabaseServer
    .from("analyses")
    .select("id,crop_name,image_path,result,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("Analysis history lookup failed", error);
    return NextResponse.json({ error: "Unable to load analysis history." }, { status: 500 });
  }
  const { count, error: countError } = await supabaseServer
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    console.error("Analysis count lookup failed", countError);
    return NextResponse.json({ error: "Unable to load analysis history." }, { status: 500 });
  }
  const { count: validated, error: validatedError } = await supabaseServer
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("result->visual->>disease", "is", null);
  if (validatedError) {
    console.error("Validated analysis count lookup failed", validatedError);
    return NextResponse.json({ error: "Unable to load analysis history." }, { status: 500 });
  }
  return NextResponse.json({ analyses: data || [], total: count || 0, validated: validated || 0 });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { cropName, imagePath, result } = await request.json();
  if (!cropName || !result) return NextResponse.json({ error: "Crop and result are required." }, { status: 400 });
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
