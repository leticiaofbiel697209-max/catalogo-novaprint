-- Restore Gabriel's administrator role without changing application behavior.
-- This is intentionally limited to the existing auth user with this exact email.
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where lower(u.email) = 'gabriel.gimenez@outlook.com.br'
  and not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = u.id
      and ur.role = 'admin'::public.app_role
  );
