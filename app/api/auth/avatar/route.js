import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth-server";
import { supabaseServer, supabaseServerConfigured } from "../../../../lib/supabase";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function cloudinarySignature(params, secret) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("sha1").update(`${serialized}${secret}`).digest("hex");
}

async function destroyCloudinaryAsset(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret || !publicId) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new FormData();
  body.append("public_id", publicId);
  body.append("timestamp", String(timestamp));
  body.append("api_key", apiKey);
  body.append("signature", cloudinarySignature({ public_id: publicId, timestamp }, apiSecret));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Cloudinary avatar removal failed.");
}

export async function POST(request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!supabaseServerConfigured) return NextResponse.json({ error: "Profile settings are temporarily unavailable." }, { status: 503 });
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return NextResponse.json({ error: "Cloudinary is not configured for profile photos." }, { status: 503 });

  try {
    const file = (await request.formData()).get("file");
    if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "A profile image is required." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: "Profile photos must be JPG, PNG, or WebP images up to 5 MB." }, { status: 400 });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = process.env.CLOUDINARY_AVATAR_FOLDER || "ayursatya/avatars";
    const publicId = `user-${currentUser.id}`;
    const body = new FormData();
    body.append("file", new Blob([await file.arrayBuffer()], { type: file.type }), file.name);
    body.append("api_key", apiKey);
    body.append("timestamp", String(timestamp));
    body.append("folder", folder);
    body.append("public_id", publicId);
    body.append("overwrite", "true");
    body.append("invalidate", "true");
    body.append("signature", cloudinarySignature({ folder, invalidate: "true", overwrite: "true", public_id: publicId, timestamp }, apiSecret));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok || !payload.secure_url || !payload.public_id) {
      console.error("Cloudinary avatar upload failed", payload);
      return NextResponse.json({ error: "Cloudinary rejected the profile image." }, { status: 502 });
    }
    const { data, error } = await supabaseServer.from("app_users").update({ avatar_url: payload.secure_url, avatar_public_id: payload.public_id }).eq("id", currentUser.id).select("id,email,full_name,avatar_url,avatar_public_id").single();
    if (error || !data) {
      try { await destroyCloudinaryAsset(payload.public_id); } catch (cleanupError) { console.error("Avatar cleanup failed", cleanupError); }
      console.error("Profile avatar persistence failed", error);
      return NextResponse.json({ error: "The profile image could not be saved." }, { status: 500 });
    }
    return NextResponse.json({ user: data });
  } catch (error) {
    console.error("Profile avatar upload failed", error);
    return NextResponse.json({ error: "The profile image could not be uploaded." }, { status: 502 });
  }
}

export async function DELETE() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!supabaseServerConfigured) return NextResponse.json({ error: "Profile settings are temporarily unavailable." }, { status: 503 });
  if (!currentUser.avatar_public_id) return NextResponse.json({ user: currentUser });
  try {
    await destroyCloudinaryAsset(currentUser.avatar_public_id);
    const { data, error } = await supabaseServer.from("app_users").update({ avatar_url: null, avatar_public_id: null }).eq("id", currentUser.id).select("id,email,full_name,avatar_url,avatar_public_id").single();
    if (error || !data) {
      console.error("Profile avatar record removal failed", error);
      return NextResponse.json({ error: "The profile photo was removed from storage but could not be cleared from your profile." }, { status: 500 });
    }
    return NextResponse.json({ user: data });
  } catch (error) {
    console.error("Profile avatar removal failed", error);
    return NextResponse.json({ error: "The profile photo could not be removed." }, { status: 502 });
  }
}
