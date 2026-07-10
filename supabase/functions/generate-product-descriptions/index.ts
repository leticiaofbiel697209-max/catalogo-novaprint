// Edge Function: generate-product-descriptions
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody {
  product_ids?: string[];
  overwrite?: boolean;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await authClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReqBody = await req.json().catch(() => ({}));
    const db = createClient(supabaseUrl, supabaseServiceKey);

    let query = db.from("products").select("id, name, code, brand, description, categories(name)");
    if (body.product_ids && body.product_ids.length > 0) {
      query = query.in("id", body.product_ids);
    } else if (!body.overwrite) {
      query = query.or("description.is.null,description.eq.");
    }
    const limit = Math.min(Math.max(Number(body.limit ?? 500) || 500, 1), 500);
    const { data: products, error } = await query.limit(limit);
    if (error) throw error;
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0, message: "Nada para gerar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const errors: { id: string; error: string }[] = [];

    for (const p of products) {
      try {
        const categoryName = (p as any).categories?.name ?? "";
        const prompt = `Gere uma descricao comercial curta, de 55 a 85 palavras, em portugues do Brasil, para catalogo B2B de suprimentos de impressao.\n\nRegras:\n- Nao use markdown.\n- Nao invente rendimento, compatibilidade, modelos de impressora ou especificacoes que nao estejam claros no nome/codigo/marca.\n- Se for toner, cartucho, cilindro, tinta ou refil, destaque aplicacao profissional, qualidade de impressao e compatibilidade apenas pelo modelo informado.\n- Se as informacoes forem genericas, escreva de forma segura e objetiva.\n\nNome: ${p.name}\nCodigo: ${p.code ?? "-"}\nMarca: ${p.brand ?? "-"}\nCategoria: ${categoryName || "-"}`;

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você é um copywriter especializado em e-commerce de suprimentos de impressão." },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!aiRes.ok) {
          const txt = await aiRes.text();
          errors.push({ id: p.id, error: `AI ${aiRes.status}: ${txt.slice(0, 200)}` });
          if (aiRes.status === 429 || aiRes.status === 402) break;
          continue;
        }
        const json = await aiRes.json();
        const description: string = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (!description) {
          errors.push({ id: p.id, error: "Resposta vazia" });
          continue;
        }
        const { error: upErr } = await db.from("products").update({ description }).eq("id", p.id);
        if (upErr) {
          errors.push({ id: p.id, error: upErr.message });
        } else {
          updated++;
        }
      } catch (e) {
        errors.push({ id: p.id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, updated, total: products.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
