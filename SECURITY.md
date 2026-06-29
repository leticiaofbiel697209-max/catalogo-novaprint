# Security Decisions & Known Findings

This file documents intentional security trade-offs and why the related linter findings are expected and accepted.

## 1. Public INSERT on orders and order_items

The portal accepts orders from anonymous customers. The RLS policies therefore allow `anon` and `authenticated` users to insert orders and order_items with `WITH CHECK (true)`.

- Files: `supabase/migrations/20260628*_orders*.sql`
- Why: business requirement to let visitors complete checkout without mandatory login.
- Trade-offs: a malicious client could theoretically send crafted fields.
- Mitigation: checkout flow is controlled by UI code; only `total_value`, `status`, and `gestaoclick_id` are not exposed to the form. If abuse becomes a concern, we can restrict the INSERT policy to allow only `customer_name`, `customer_email`, `customer_phone`, `shipping_address`, and `notes`, and force default values for the rest.

## 2. Public EXECUTE on `public.has_role` security definer function

The `public.has_role(uid, role)` helper is `SECURITY DEFINER` and granted to `anon` and `authenticated` so that RLS policies and client-side admin checks can determine whether a signed-in user is an admin.

- File: `supabase/migrations/20260628*_user_roles_and_admin.sql`
- Why: RLS policies on `user_roles` only allow reading your own rows; `has_role` runs as postgres to read `user_roles` across all users without leaking the full table. Revoking `EXECUTE` would break the admin check and the admin layout entirely.
- Trade-offs: the function is callable by any client, but it only returns `boolean` for the given `(uid, role)` pair and does not expose other users' data.
- Mitigation: keep the function minimal; do not expose raw data inside it.

## 3. Cost price / margin isolation

Internal cost prices are stored in the admin-only `product_costs` table, not in the publicly readable `products` table. The public catalog therefore cannot expose margins.

- File: `supabase/migrations/20260629*_product_costs.sql`
- Why: protect internal supplier/cost information from public visitors while still giving admins the margin data they need.
- Trade-offs: the admin UI must fetch cost prices separately, and imports must populate both tables.

## 4. Storage bucket `product-images`

RLS policies allow public read access to product images and write access only to admins. This is intentional for the storefront.

## 5. Security linter baseline

After the product_costs migration, the remaining Supabase linter warnings are the expected ones listed above. No new critical findings remain. The security scan should be re-run whenever a new table or policy is added.
