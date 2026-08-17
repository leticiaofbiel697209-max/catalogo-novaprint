CREATE OR REPLACE FUNCTION public.public_categories_with_products()
RETURNS TABLE (id uuid, name text, product_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, c.name, count(p.id) AS product_count
  FROM public.categories c
  JOIN public.products p ON p.category_id = c.id AND p.active = true
  WHERE c.active = true
  GROUP BY c.id, c.name
  HAVING count(p.id) > 0
  ORDER BY c.name
$$;

GRANT EXECUTE ON FUNCTION public.public_categories_with_products() TO anon, authenticated;
