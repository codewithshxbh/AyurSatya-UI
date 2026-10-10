import crypto from "node:crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase";

export const SESSION_COOKIE = "ayursatya_session";
const SESSION_DAYS = 14;

export function authUnavailable() {
  return !supabaseServer;
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const { error } = await supabaseServer.from("app_sessions").insert({ token, user_id: userId, expires_at: expiresAt });
  if (error) throw error;
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || !supabaseServer) return null;
  const { data, error } = await supabaseServer.from("app_sessions").select("user_id, expires_at, app_users(id,email,full_name)").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data?.app_users) return null;
  return data.app_users;
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token && supabaseServer) await supabaseServer.from("app_sessions").delete().eq("token", token);
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}
