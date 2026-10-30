-- Optional. Run in the Supabase SQL editor if analysis history stays slow.
CREATE INDEX IF NOT EXISTS analyses_user_id_created_at_idx
  ON public.analyses (user_id, created_at DESC);
