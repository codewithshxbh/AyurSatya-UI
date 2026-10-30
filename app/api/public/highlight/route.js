import { NextResponse } from "next/server";
import { loadPublicHighlight } from "../../../../lib/public-highlight";

export const dynamic = "force-dynamic";

export async function GET() {
  const { highlight, knowledgeCount } = await loadPublicHighlight();
  return NextResponse.json(
    { highlight, knowledgeCount },
    { headers: { "Cache-Control": "no-store" } }
  );
}
