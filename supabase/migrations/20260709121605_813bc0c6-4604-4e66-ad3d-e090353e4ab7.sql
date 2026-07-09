DROP POLICY IF EXISTS "Anyone can request access" ON public.admin_access_requests;
CREATE POLICY "Anyone can request access" ON public.admin_access_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND length(trim(email)) BETWEEN 5 AND 320
    AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    AND length(trim(name)) BETWEEN 2 AND 160
    AND (phone IS NULL OR length(trim(phone)) <= 40)
    AND (message IS NULL OR length(trim(message)) <= 1000)
  );

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_roles_admin_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_user_roles_admin_only() TO service_role;