-- Category review workflow for the catalog.
-- Auto-classification writes only a suggestion; the public category_id remains untouched
-- until an administrator explicitly approves the suggestion.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS suggested_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS category_rule text,
  ADD COLUMN IF NOT EXISTS category_review_status text NOT NULL DEFAULT 'none';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_category_review_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_category_review_status_check
  CHECK (category_review_status IN ('none', 'suggested', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_products_category_review_status
  ON public.products(category_review_status);

CREATE INDEX IF NOT EXISTS idx_products_suggested_category_id
  ON public.products(suggested_category_id);

UPDATE public.products
SET category_review_status = 'approved'
WHERE category_id IS NOT NULL
  AND category_review_status = 'none';
