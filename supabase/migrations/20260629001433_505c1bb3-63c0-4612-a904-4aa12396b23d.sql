CREATE OR REPLACE FUNCTION public.enforce_user_roles_admin_only()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage user roles';
  END IF;
  IF NEW.user_id = auth.uid() AND NEW.role = 'admin' THEN
    RAISE EXCEPTION 'Users cannot assign themselves the admin role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_user_roles_admin_only
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_roles_admin_only();