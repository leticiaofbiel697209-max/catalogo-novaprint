import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Item {
  product_id: string;
  quantity: number;
}

interface Payload {
  customer: {
    name: string;
    company: string;
    cnpj?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  items: Item[];
  notes?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;

    // Basic validation
    if (!body?.customer?.name?.trim() || !body?.customer?.company?.trim()) {
      return json({ error: "Nome e empresa são obrigatórios" }, 400);
    }
    if (!body.customer.phone?.trim() && !body.customer.email?.trim()) {
      return json({ error: "Informe telefone ou e-mail" }, 400);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: "Carrinho vazio" }, 400);
    }
    if (body.items.length > 200) {
      return json({ error: "Muitos itens" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch products from DB (never trust client-sent prices)
    const ids = [...new Set(body.items.map((i) => i.product_id))];
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, code, price, stock, active")
      .in("id", ids);
    if (pErr) throw pErr;

    const map = new Map(products?.map((p) => [p.id, p]) ?? []);
    let total = 0;
    const orderItems: any[] = [];

    for (const it of body.items) {
      const p = map.get(it.product_id);
      if (!p || !p.active) return json({ error: `Produto indisponível` }, 400);
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 0));
      const unit = Number(p.price);
      const line = unit * qty;
      total += line;
      orderItems.push({
        product_id: p.id,
        product_name: p.name,
        product_code: p.code,
        quantity: qty,
        unit_price: unit,
        total_price: line,
      });
    }

    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .insert({
        name: body.customer.name.trim().slice(0, 120),
        company: body.customer.company.trim().slice(0, 160),
        cnpj: body.customer.cnpj?.trim() || null,
        phone: body.customer.phone?.trim() || null,
        email: body.customer.email?.trim() || null,
      })
      .select()
      .single();
    if (cErr) throw cErr;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        customer_id: customer.id,
        total_value: total,
        status: "recebido",
        notes: body.notes?.slice(0, 1000) || null,
      })
      .select()
      .single();
    if (oErr) throw oErr;

    const withOrder = orderItems.map((oi) => ({ ...oi, order_id: order.id }));
    const { error: iErr } = await supabase.from("order_items").insert(withOrder);
    if (iErr) throw iErr;

    return json({ order_id: order.id });
  } catch (e: any) {
    console.error("submit-order error", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
