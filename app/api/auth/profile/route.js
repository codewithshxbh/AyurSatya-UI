import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth-server";
import { supabaseServer, supabaseServerConfigured } from "../../../../lib/supabase";

export async function PATCH(request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!supabaseServerConfigured) return NextResponse.json({ error: "Profile settings are temporarily unavailable." }, { status: 503 });

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid profile update." }, { status: 400 });
  }

  const fullName = typeof input?.fullName === "string" ? input.fullName.trim() : "";
  if (fullName.length < 2 || fullName.length > 80) {
    return NextResponse.json({ error: "Your name must be between 2 and 80 characters." }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("app_users")
    .update({ full_name: fullName })
    .eq("id", currentUser.id)
    .select("id,email,full_name,avatar_url,avatar_public_id")
    .single();
  if (error || !data) {
    console.error("Profile update failed", error);
    return NextResponse.json({ error: "Your profile could not be updated. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ user: data });
}
