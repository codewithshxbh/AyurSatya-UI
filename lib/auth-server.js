import crypto from "node:crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase";

export const AUTH_COOKIE = "ayursatya_auth_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function authSecret() {
  return process.env.APP_AUTH_SECRET || "";
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const message = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", authSecret()).update(message).digest("base64url");
  return `${message}.${signature}`;
}

function verifyToken(token) {
  if (!authSecret() || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto.createHmac("sha256", authSecret()).update(`${header}.${body}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authUnavailable() {
  return !supabaseServer || !authSecret();
}

export function setAuthCookie(token) {
  cookies().set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function createSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({
    sub: user.id,
    iat: now,
    exp: now + SESSION_MAX_AGE,
    jti: crypto.randomUUID()
  });
  const { error } = await supabaseServer.from("app_sessions").insert({
    user_id: user.id,
    token,
    expires_at: new Date((now + SESSION_MAX_AGE) * 1000).toISOString()
  });
  if (error) throw error;
  setAuthCookie(token);
  return token;
}

export async function getCurrentUser() {
  if (authUnavailable()) return null;
  const token = cookies().get(AUTH_COOKIE)?.value;
  const payload = verifyToken(token);
  if (!payload) return null;
  const { data, error } = await supabaseServer
    .from("app_sessions")
    .select("user_id,expires_at,app_users(id,email,full_name,avatar_url,avatar_public_id)")
    .eq("token", token)
    .eq("user_id", payload.sub)
    .maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) return null;
  const user = Array.isArray(data.app_users) ? data.app_users[0] : data.app_users;
  return user || null;
}

export async function destroySession() {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (token && supabaseServer) {
    const { error } = await supabaseServer.from("app_sessions").delete().eq("token", token);
    if (error) console.error("Session deletion failed", error);
  }
  cookies().set(AUTH_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}
