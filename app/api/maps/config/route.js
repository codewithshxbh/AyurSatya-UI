import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth-server";
import { getPublicMapConfig } from "../../../../lib/map-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json(getPublicMapConfig());
}
