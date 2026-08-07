# Security Decisions & Known Findings

This file documents the current security model and the remaining operational steps.

## 1. Checkout writes go through `submit-order`

The public storefront submits checkout data through the `submit-order` Edge Function. The function fetches products again from the database and recalculates prices server-side, so client-sent prices are never trusted.

A migration was added at `supabase/migrations/20260807183500_harden_public_order_writes.sql` to remove direct `anon` and `authenticated` INSERT access from `customers`, `orders`, and `order_items` once applied to the Supabase project. The Edge Function uses the service role and therefore remains able to create the complete order atomically from the storefront flow.

Important: repository migration state and deployed database state are separate. Confirm the migration has been applied in Supabase before considering the public INSERT policies removed in production.

## 2. Public EXECUTE on `public.has_role` security definer function

The `public.has_role(uid, role)` helper is `SECURITY DEFINER` and available to authenticated flows so RLS policies and admin checks can determine whether the signed-in user is an admin.

- Why: RLS policies on `user_roles` only allow reading the signed-in user's own rows; `has_role` performs the role check without exposing the full table.
- Trade-off: the function is callable but only returns a boolean.
- Mitigation: keep the function minimal and never return role-table contents from it.

## 3. Cost price / margin isolation

Internal cost prices are stored in the admin-only `product_costs` table, not in the publicly readable `products` table. The public catalog therefore cannot expose margins.

- Why: protect internal supplier/cost information while still giving admins the margin data they need.
- Trade-off: admin screens and imports must populate/read product costs separately.

## 4. Storage bucket `product-images`

Catalog product images are public storefront assets, while write operations must remain restricted to admins/service-role server functions.

The automatic image function stores downloaded images in Supabase Storage and records the public URL. Manual upload should follow the same public-asset strategy rather than persisting very long-lived signed URLs; this remains a cleanup item for the product-admin refactor.

## 5. Automatic product image search

The repository implementation now requests strict safe search, rejects candidates containing known adult-content signals before download, and requires a minimum relevance score before an image can be accepted. Automatically found images still remain marked for manual review.

Repository code and deployed Edge Function state are separate. Confirm the updated function is deployed in Supabase before considering this behavior active in production.

## 6. Security linter baseline

Run the Supabase security/linter checks after applying any new migration, storage-policy change, or Edge Function deployment. No security decision in this document should be treated as deployed solely because the repository contains the corresponding code.
