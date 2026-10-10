import { NextResponse } from "next/server";
import { verifyPassword } from "../../../../lib/password";
import { authUnavailable, createSession } from "../../../../lib/auth-server";
import { supabaseServer } from "../../../../lib/supabase";

export async function POST(request) {
  if (authUnavailable()) return NextResponse.json({ error: "Server authentication is not configured." }, { status: 503 });
  const { email, password } = await request.json();
  const { data: user } = await supabaseServer.from("app_users").select("id,email,full_name,password_hash").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (!user || !(await verifyPassword(password, user.password_hash))) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, full_name: user.full_name } });
}
