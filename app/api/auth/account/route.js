import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "../../../../lib/auth-server";
import { verifyPassword } from "../../../../lib/password";
import { supabaseServer, supabaseServerConfigured } from "../../../../lib/supabase";

export async function DELETE(request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!supabaseServerConfigured) return NextResponse.json({ error: "Account deletion is temporarily unavailable." }, { status: 503 });

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Confirm deletion with your password and DELETE." }, { status: 400 });
  }
  const password = typeof input?.password === "string" ? input.password : "";
  const confirmation = typeof input?.confirmation === "string" ? input.confirmation : "";
  if (confirmation !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE exactly to confirm account removal.' }, { status: 400 });
  }

  const { data: storedUser, error: lookupError } = await supabaseServer
    .from("app_users")
    .select("id,password_hash")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (lookupError || !storedUser?.password_hash) {
    console.error("Account deletion lookup failed", lookupError);
    return NextResponse.json({ error: "Unable to verify account ownership." }, { status: 500 });
  }
  if (!(await verifyPassword(password, storedUser.password_hash))) {
    return NextResponse.json({ error: "Your password is incorrect." }, { status: 401 });
  }

  const { error: analysesError } = await supabaseServer.from("analyses").delete().eq("user_id", currentUser.id);
  if (analysesError) {
    console.error("Account analyses deletion failed", analysesError);
    return NextResponse.json({ error: "Your account could not be deleted safely. No account changes were made." }, { status: 500 });
  }
  const { error: sessionsError } = await supabaseServer.from("app_sessions").delete().eq("user_id", currentUser.id);
  if (sessionsError) {
    console.error("Account sessions deletion failed", sessionsError);
    return NextResponse.json({ error: "Account deletion stopped after saved analyses were removed. Contact support before retrying." }, { status: 500 });
  }
  const { error: userError } = await supabaseServer.from("app_users").delete().eq("id", currentUser.id);
  if (userError) {
    console.error("Account deletion failed", userError);
    return NextResponse.json({ error: "Account deletion stopped after account sessions were removed. Contact support before retrying." }, { status: 500 });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
