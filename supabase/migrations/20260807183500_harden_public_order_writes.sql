-- Harden public checkout writes.
-- The storefront now submits orders exclusively through the submit-order Edge Function,
-- which recalculates product prices server-side using the service role.
-- This migration removes direct client INSERT access to the underlying order tables.

DROP POLICY IF EXISTS "Public can create customers" ON public.customers;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can insert order items" ON public.order_items;

REVOKE INSERT ON public.customers FROM anon, authenticated;
REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;

-- service_role retains full access and the submit-order Edge Function continues to work.
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;
