import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth-server";
import { deleteAnalysis, loadAnalysisDetail } from "../../../../lib/analysis-history";
import { supabaseServer } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request, context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = await Promise.resolve(context?.params);
  const result = await loadAnalysisDetail(supabaseServer, user.id, params?.id);
  if (result.error) {
    if (result.status === 400) return NextResponse.json({ error: result.error.message }, { status: 400 });
    if (result.status === 404) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    console.error("Analysis detail lookup failed", result.error);
    return NextResponse.json(
      { error: result.timeout ? "Analysis history is taking too long to load. Try again." : "Unable to load analysis." },
      { status: result.status || 500 }
    );
  }
  return NextResponse.json({ analysis: result.analysis });
}

export async function DELETE(_request, context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = await Promise.resolve(context?.params);
  const result = await deleteAnalysis(supabaseServer, user.id, params?.id);
  if (result.error) {
    if (result.status === 400) return NextResponse.json({ error: result.error.message }, { status: 400 });
    if (result.status === 404) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    console.error("Analysis delete failed", result.error);
    return NextResponse.json(
      { error: result.timeout ? "Deleting this analysis is taking too long. Try again." : "Unable to delete this analysis." },
      { status: result.status || 500 }
    );
  }
  return NextResponse.json({ deleted: true, id: result.id });
}
