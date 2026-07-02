
-- Global setting: catalog price visibility (admin controlled)
GRANT SELECT ON public.settings TO anon;
CREATE POLICY "Public can read catalog display setting" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (key = 'catalog_show_prices');

INSERT INTO public.settings(key, value) VALUES ('catalog_show_prices', 'true')
ON CONFLICT (key) DO NOTHING;

-- Admin access requests
CREATE TABLE public.admin_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
GRANT INSERT ON public.admin_access_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.admin_access_requests TO authenticated;
GRANT ALL ON public.admin_access_requests TO service_role;
ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can request access" ON public.admin_access_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins read requests" ON public.admin_access_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update requests" ON public.admin_access_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete requests" ON public.admin_access_requests
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
