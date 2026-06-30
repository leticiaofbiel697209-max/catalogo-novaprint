// Edge Function: import-products (bulk upsert)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InProduct {
  code: string;
  name: string;
  brand?: string | null;
  category_id?: string | null;
  cost?: number | null;
  price?: number | null;
  stock?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: role } = await authClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const products: InProduct[] = Array.isArray(body.products) ? body.products : [];
    if (!products.length) return new Response(JSON.stringify({ error: "No products" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const db = createClient(url, service);

    // resolve categories by name if provided as category (string)
    const { data: cats } = await db.from("categories").select("id, name");
    const catByName = new Map((cats ?? []).map((c: any) => [c.name.toLowerCase(), c.id]));
    const fallbackCat = (cats ?? []).find((c: any) => c.name.toLowerCase() === "suprimentos")?.id ?? cats?.[0]?.id;

    const rows = products.map((p: any) => {
      let cat = p.category_id;
      if (!cat && p.category) cat = catByName.get(String(p.category).toLowerCase());
      if (!cat) cat = fallbackCat;
      return {
        code: String(p.code).slice(0, 60),
        name: String(p.name).slice(0, 255),
        brand: p.brand ?? null,
        category_id: cat,
        price: Number(p.price ?? 0),
        stock: Number(p.stock ?? 0),
        active: true,
      };
    });

    // upsert in chunks
    const chunk = 100;
    let inserted = 0;
    const errors: any[] = [];
    const allIds: { id: string; code: string }[] = [];
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { data, error } = await db.from("products").upsert(slice, { onConflict: "code" }).select("id, code");
      if (error) { errors.push(error.message); continue; }
      inserted += data?.length ?? 0;
      if (data) allIds.push(...data);
    }

    // upsert costs
    const costRows = products
      .filter((p) => p.cost != null && Number(p.cost) > 0)
      .map((p) => {
        const id = allIds.find((r) => r.code === String(p.code).slice(0, 60))?.id;
        return id ? { product_id: id, cost_price: Number(p.cost) } : null;
      })
      .filter(Boolean) as { product_id: string; cost_price: number }[];

    for (let i = 0; i < costRows.length; i += chunk) {
      const { error } = await db.from("product_costs").upsert(costRows.slice(i, i + chunk), { onConflict: "product_id" });
      if (error) errors.push(error.message);
    }

    return new Response(JSON.stringify({ ok: true, inserted, costs: costRows.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
