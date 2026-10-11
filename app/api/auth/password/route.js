import { NextResponse } from "next/server";
import { createSession, destroySession, getCurrentUser } from "../../../../lib/auth-server";
import { hashPassword, verifyPassword } from "../../../../lib/password";
import { supabaseServer, supabaseServerConfigured } from "../../../../lib/supabase";

export async function PATCH(request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!supabaseServerConfigured) return NextResponse.json({ error: "Password settings are temporarily unavailable." }, { status: 503 });

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Send your current and new password." }, { status: 400 });
  }

  const currentPassword = typeof input?.currentPassword === "string" ? input.currentPassword : "";
  const newPassword = typeof input?.newPassword === "string" ? input.newPassword : "";
  if (!currentPassword || newPassword.length < 8 || newPassword.length > 200) {
    return NextResponse.json({ error: "Enter your current password and a new password of 8 to 200 characters." }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Your new password must be different from the current password." }, { status: 400 });
  }

  const { data: storedUser, error: lookupError } = await supabaseServer
    .from("app_users")
    .select("id,email,full_name,password_hash")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (lookupError || !storedUser?.password_hash) {
    console.error("Password lookup failed", lookupError);
    return NextResponse.json({ error: "Unable to verify your current password." }, { status: 500 });
  }
  if (!(await verifyPassword(currentPassword, storedUser.password_hash))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }

  const { error: updateError } = await supabaseServer
    .from("app_users")
    .update({ password_hash: await hashPassword(newPassword) })
    .eq("id", currentUser.id);
  if (updateError) {
    console.error("Password update failed", updateError);
    return NextResponse.json({ error: "Your password could not be changed. Please try again." }, { status: 500 });
  }

  await destroySession();
  await createSession({ id: storedUser.id, email: storedUser.email, full_name: storedUser.full_name });
  return NextResponse.json({ ok: true });
}
