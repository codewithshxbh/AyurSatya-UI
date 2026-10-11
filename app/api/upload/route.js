import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth-server";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary is not configured. Add its server credentials before uploading to the media store." },
      { status: 503 }
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "An image file is required." }, { status: 400 });
    }
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Only JPG or PNG images up to 10 MB are accepted." }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "ayursatya/review";
    const signature = crypto
      .createHash("sha1")
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const body = new FormData();
    body.append("file", new Blob([await file.arrayBuffer()], { type: file.type }), file.name);
    body.append("api_key", apiKey);
    body.append("timestamp", String(timestamp));
    body.append("folder", folder);
    body.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error("Cloudinary upload failed", payload);
      return NextResponse.json({ error: "Cloudinary rejected the image upload." }, { status: 502 });
    }
    return NextResponse.json({
      secureUrl: payload.secure_url,
      publicId: payload.public_id,
      width: payload.width,
      height: payload.height,
      bytes: payload.bytes
    });
  } catch (error) {
    console.error("Image upload failed", error);
    return NextResponse.json({ error: "The image upload could not be completed." }, { status: 502 });
  }
}
