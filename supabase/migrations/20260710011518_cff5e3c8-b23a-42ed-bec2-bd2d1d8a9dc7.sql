SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES ('0b6c1b44-bd27-403b-88ce-47f9df8a4c6f', 'admin') ON CONFLICT (user_id, role) DO NOTHING;
SET session_replication_role = DEFAULT;