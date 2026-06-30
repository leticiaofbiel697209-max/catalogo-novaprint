// Edge Function: send-order-to-gestaoclick
// Envia um pedido para o GestãoClick (modo mock nesta versão).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ReqBody {
  order_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verifica o JWT do chamador
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await authClient.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;

    // Cliente admin (service role) para bypass de RLS depois de validar role
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isAdminRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!isAdminRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReqBody = await req.json().catch(() => ({}));
    if (!body.order_id) {
      return new Response(JSON.stringify({ error: "order_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .eq("id", body.order_id)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mockMode = (Deno.env.get("GESTAOCLICK_MOCK_MODE") ?? "true").toLowerCase() === "true";
    const apiUrl = Deno.env.get("GESTAOCLICK_API_URL");
    const apiToken = Deno.env.get("GESTAOCLICK_API_TOKEN");

    // Monta payload
    const payload = {
      cliente: {
        nome: order.customers?.name,
        empresa: order.customers?.company,
        cnpj: order.customers?.cnpj,
        telefone: order.customers?.phone,
        email: order.customers?.email,
      },
      pedido: {
        numero_interno: order.order_number,
        observacoes: order.notes,
        total: order.total_value,
        itens: (order.order_items ?? []).map((i: any) => ({
          produto: i.product_name,
          codigo: i.product_code,
          quantidade: i.quantity,
          preco_unitario: i.unit_price,
          total: i.total_price,
        })),
      },
    };

    let responsePayload: unknown = null;
    let gestaoclickId: string | null = null;
    let status: "sucesso" | "erro" = "sucesso";
    let errorMessage: string | null = null;

    try {
      if (mockMode) {
        // Simula sucesso
        gestaoclickId = `MOCK-${Date.now()}-${order.order_number}`;
        responsePayload = { mock: true, id: gestaoclickId, message: "Envio simulado com sucesso" };
      } else {
        if (!apiUrl || !apiToken) throw new Error("Credenciais GestãoClick ausentes");
        const resp = await fetch(`${apiUrl}/pedidos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "access-token": apiToken,
          },
          body: JSON.stringify(payload),
        });
        const json = await resp.json();
        responsePayload = json;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(json)}`);
        gestaoclickId = json?.data?.id?.toString() ?? null;
      }

      await admin
        .from("orders")
        .update({ status: "enviado_ao_gestaoclick", gestaoclick_id: gestaoclickId })
        .eq("id", order.id);
    } catch (err) {
      status = "erro";
      errorMessage = err instanceof Error ? err.message : String(err);
      await admin.from("orders").update({ status: "erro_integracao" }).eq("id", order.id);
    }

    await admin.from("integration_logs").insert({
      order_id: order.id,
      service: "gestaoclick",
      action: "send_order",
      status,
      request_payload: payload as any,
      response_payload: responsePayload as any,
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ success: status === "sucesso", gestaoclick_id: gestaoclickId, error: errorMessage }),
      {
        status: status === "sucesso" ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
