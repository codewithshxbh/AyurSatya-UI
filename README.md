# AyurSatya

AyurSatya is a responsive Next.js application for medicinal crop image analysis. It includes a responsive workspace, Supabase email authentication, crop selection, image validation and preview, history, knowledge cards, and a clear hand-off point for the prediction service.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Add these values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Enable Email in Supabase Authentication providers. Add `http://localhost:3000` to the Supabase Authentication URL configuration.

The optional starter database table and row-level security policies are in [`supabase/schema.sql`](./supabase/schema.sql). The current analysis button validates the image and provides the integration point for your model API; it does not claim a prediction before the model endpoint is connected.
