-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  avatar_url text,
  avatar_public_id text,
  CONSTRAINT app_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  crop_name text NOT NULL,
  image_path text,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT analyses_pkey PRIMARY KEY (id),
  CONSTRAINT analyses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id)
);
CREATE TABLE public.knowledge_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  crop_name text NOT NULL,
  matched_disease text NOT NULL DEFAULT 'General'::text,
  information text NOT NULL,
  source_title text NOT NULL,
  source_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  normalized_crop text,
  record_type text NOT NULL DEFAULT 'general_crop'::text CHECK (record_type = ANY (ARRAY['general_crop'::text, 'botanical'::text, 'traditional_reference'::text, 'disease_context'::text])),
  summary text,
  source_institution text,
  publication_date date,
  source_locator text,
  original_language_text text,
  verified_translation text,
  verification_status text NOT NULL DEFAULT 'needs_review'::text CHECK (verification_status = ANY (ARRAY['verified'::text, 'needs_review'::text, 'rejected'::text])),
  reviewer_notes text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_record_id text,
  CONSTRAINT knowledge_records_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT app_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id)
);