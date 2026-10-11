# AyurSatya

AyurSatya is a responsive Next.js application for medicinal crop image analysis. It includes application-owned authentication, crop selection, Cloudinary image storage, image validation and preview, history, source-referenced knowledge retrieval, and a clear hand-off point for model inference. Supabase is used only as the PostgreSQL database.

## Current prototype status

The local dataset was inspected on 10 October 2026: 2,547 JPG images in 12 class folders:
Neem (Healthy, Spot, Web Blight, Yellow), Tulsi (Healthy, Downy Mildew, Web Blight, Yellow Spot), and Kalanchoe (Healthy, Web Blight, Yellow, Yellow Blight). The dataset is ignored by Git and is not deployed.

The app does not fabricate EfficientNet predictions, Grad-CAM heatmaps, satellite indices, or knowledge records. Local/self-hosted Node deployments can run the generated EfficientNet-B0 diagnostic checkpoint through `ml/inference.py`; Vercel deliberately shows an unavailable state because its Node runtime cannot execute the repository's Python/Torch runtime and the ignored checkpoint is not a deployable bundle. Knowledge cards are loaded from `knowledge_records`; an empty table is shown as unavailable rather than filled with unverified starter text.

Cloudinary upload is implemented server-side at `/api/upload`; configure the `CLOUDINARY_*` variables before the review. The image URL is returned with the analysis result and can be stored in the `analyses.image_url` column.

The canonical database schema is [`supabase_schema/schema.sql`](./supabase_schema/schema.sql). Apply it to the Supabase PostgreSQL project before using the protected routes. Supabase Auth is not used.

## Knowledge base setup

The knowledge module is intentionally empty until reviewed records are added. To prepare an existing `knowledge_records` table:

1. Open the Supabase project dashboard and select **SQL Editor**.
2. Review and run [`supabase_schema/003_knowledge_metadata.sql`](./supabase_schema/003_knowledge_metadata.sql). It only adds columns, backfills missing metadata with review-safe defaults, adds indexes/constraints, and enables RLS; it does not delete rows.
3. Review [`supabase_schema/004_knowledge_verified_seed.sql`](./supabase_schema/004_knowledge_verified_seed.sql), including each source URL and claim, then run it only if those records meet your review standard. It is idempotent, preserves unrelated rows, and never changes the verification status or reviewer notes of an existing seeded row.
4. Refresh the app and leave the Knowledge Base filter on **Verified only** for user-facing records.

The seed currently contains botanical identity/distribution records based on Kew Science's Plants of the World Online (POWO) pages for *Azadirachta indica*, *Ocimum tenuiflorum*, and *Kalanchoe pinnata*. It contains no disease, treatment, dosage, safety, or efficacy claims. Publication dates are left blank because the cited web records do not provide a stable publication date in the reviewed material. Do not run either SQL file against production until you have reviewed the diff and selected the intended Supabase project.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Add these values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
SUPABASE_SECRET_KEY=your-service-role-key
APP_AUTH_SECRET=generate-a-long-random-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_UPLOAD_FOLDER=ayursatya/review
INFERENCE_SERVICE_URL=
INFERENCE_SERVICE_API_KEY=
```

Do not enable or configure Supabase Authentication for this application. Registration hashes the password with Node `scrypt`; login verifies that hash and issues an application-signed JWT in an HTTP-only, `SameSite=Strict` cookie. All database access happens in protected server routes through the service-role client, and the service-role key must never be exposed to browser code.

Accounts created previously in Supabase Auth are separate from `public.app_users` passwords. They cannot be verified by this application because the Supabase Auth password hash is not available to the application. If the migration created an `app_users` profile with a `NULL` `password_hash`, registering again with that email initializes the application password on that existing profile. Accounts that already have an application password continue to reject duplicate registration.

Do not commit `.env.local`, Cloudinary secrets, datasets, or model checkpoints. The analysis button validates and uploads the image, then uses the hosted EfficientNet-B0 service when both `INFERENCE_SERVICE_URL` and its server-side `INFERENCE_SERVICE_API_KEY` are configured. If the hosted service is not configured, it uses the local bridge when its Python environment and checkpoint are available; otherwise it returns an explicit model-unavailable result. See [`inference-service/README.md`](./inference-service/README.md) for the Render setup and checkpoint requirements.
