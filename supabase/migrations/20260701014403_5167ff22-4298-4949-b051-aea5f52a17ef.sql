
-- Lock down direct anonymous inserts; checkout now goes through edge function using service role
DROP POLICY IF EXISTS "Public can create customers" ON public.customers;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can insert order items" ON public.order_items;
