import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/password";
import { authUnavailable, createSession } from "../../../../lib/auth-server";
import { supabaseServer } from "../../../../lib/supabase";

export async function POST(request) {
  if (authUnavailable()) return NextResponse.json({ error: "Server authentication is not configured." }, { status: 503 });
  const { email, password, fullName } = await request.json();
  if (!email || !password || !fullName || password.length < 8) return NextResponse.json({ error: "Name, email, and a password of at least 8 characters are required." }, { status: 400 });
  const normalizedEmail = email.trim().toLowerCase();
  const { data: existing } = await supabaseServer.from("app_users").select("id").eq("email", normalizedEmail).maybeSingle();
  if (existing) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  const { data: user, error } = await supabaseServer.from("app_users").insert({ email: normalizedEmail, full_name: fullName.trim(), password_hash: await hashPassword(password) }).select("id,email,full_name").single();
  if (error) return NextResponse.json({ error: "Could not create your account." }, { status: 500 });
  await createSession(user.id);
  return NextResponse.json({ user });
}
