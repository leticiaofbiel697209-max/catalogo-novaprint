ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_review_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS image_review_note text,
  ADD COLUMN IF NOT EXISTS image_source_url text;

ALTER TABLE public.products
  ADD CONSTRAINT products_image_review_status_check
  CHECK (image_review_status IN ('approved', 'suspect', 'pending'));

UPDATE public.products
SET image_review_status = 'suspect',
    image_review_note = COALESCE(image_review_note, 'Imagem automática/importada antes da revisão manual')
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND image_review_status = 'approved'
  AND (
    image_url ILIKE '%/auto/%'
    OR image_url NOT ILIKE '%product-images/bulk/%'
  );