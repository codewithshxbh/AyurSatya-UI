import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth-server";
import { searchPlaces } from "../../../../lib/geocode";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = params.get("q");
  const result = await searchPlaces(query, {
    bias: {
      latitude: params.get("lat"),
      longitude: params.get("lon")
    }
  });
  return NextResponse.json(
    { results: result.results, error: result.error },
    { status: result.status }
  );
}
