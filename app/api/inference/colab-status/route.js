import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth-server";
import { getProviderConfig } from "../../../../lib/inference-providers";
import { checkColabAvailability } from "../../../../lib/colab-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ status: "offline" }, { status: 401 });
  const config = getProviderConfig("colab");
  return NextResponse.json({ status: await checkColabAvailability(config) });
}
