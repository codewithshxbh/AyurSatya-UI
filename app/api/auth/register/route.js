import { NextResponse } from "next/server";
import { authUnavailable, createSession } from "../../../../lib/auth-server";
import { hashPassword } from "../../../../lib/password";
import { supabaseServer } from "../../../../lib/supabase";

export async function POST(request) {
  if (authUnavailable()) return NextResponse.json({ error: "Application authentication is not configured." }, { status: 503 });
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON body with name, email, and password." }, { status: 400 });
  }
  const { email, password, fullName } = input;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const name = typeof fullName === "string" ? fullName.trim() : "";
  if (!normalizedEmail || !name || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Name, email, and a password of at least 8 characters are required." }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  const { data: existing, error: lookupError } = await supabaseServer
    .from("app_users")
    .select("id,email,full_name,password_hash,avatar_url,avatar_public_id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (lookupError) {
    console.error("Registration lookup failed", lookupError);
    return NextResponse.json({ error: "Unable to create the account." }, { status: 500 });
  }
  let user;
  if (existing) {
    if (existing.password_hash) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    const { data: claimed, error: claimError } = await supabaseServer
      .from("app_users")
      .update({ full_name: name, password_hash: passwordHash })
      .eq("id", existing.id)
      .is("password_hash", null)
      .select("id,email,full_name,avatar_url,avatar_public_id")
      .single();
    if (claimError || !claimed) {
      console.error("Legacy account claim failed", claimError);
      return NextResponse.json({ error: "This account could not be initialized. Please try again." }, { status: 409 });
    }
    user = claimed;
  } else {
    const { data: created, error: createError } = await supabaseServer
      .from("app_users")
      .insert({ email: normalizedEmail, full_name: name, password_hash: passwordHash })
      .select("id,email,full_name,avatar_url,avatar_public_id")
      .single();
    if (createError) {
      if (createError.code === "23505") return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      console.error("Registration failed", createError);
      return NextResponse.json({ error: "Unable to create the account." }, { status: 500 });
    }
    user = created;
  }
  await createSession(user);
  return NextResponse.json({ user });
}
