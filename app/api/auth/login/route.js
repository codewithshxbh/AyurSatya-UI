import { NextResponse } from "next/server";
import { authUnavailable, createSession } from "../../../../lib/auth-server";
import { verifyPassword } from "../../../../lib/password";
import { supabaseServer } from "../../../../lib/supabase";

export async function POST(request) {
  if (authUnavailable()) return NextResponse.json({ error: "Application authentication is not configured." }, { status: 503 });
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body with email and password." }, { status: 400 });
  }
  const { email, password } = input;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const { data: user, error } = await supabaseServer
    .from("app_users")
    .select("id,email,full_name,password_hash,avatar_url,avatar_public_id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (error || !user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (!user.password_hash) {
    return NextResponse.json({ error: "This profile needs an application password. Use Create account with this email to initialize it." }, { status: 401 });
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await createSession(user);
  return NextResponse.json({ user: { id: user.id, email: user.email, full_name: user.full_name, avatar_url: user.avatar_url, avatar_public_id: user.avatar_public_id } });
}
