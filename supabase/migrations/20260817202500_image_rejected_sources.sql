ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_rejected_sources text[] NOT NULL DEFAULT '{}';
