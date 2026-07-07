DROP POLICY IF EXISTS "Public can read catalog display setting" ON public.settings;
CREATE POLICY "Public can read display settings" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('catalog_show_prices','home_banner_visible','home_banner_title','home_banner_subtitle','home_banner_image'));
GRANT SELECT ON public.settings TO anon;