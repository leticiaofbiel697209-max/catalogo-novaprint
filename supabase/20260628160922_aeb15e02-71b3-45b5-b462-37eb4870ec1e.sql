// Edge Function: generate-product-descriptions
// Gera descrições em massa para produtos usando IA.
// Prioridade: OPENAI_API_KEY. Fallback: LOVABLE_API_KEY.
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateDescription(prompt: string): Promise<string> {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  if (openAiKey) {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "Você é um copywriter especializado em e-commerce B2B de suprimentos de impressão. Escreva descrições claras, comerciais e confiáveis em português do Brasil.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`OpenAI ${aiRes.status}: ${txt.slice(0, 300)}`);
    }

    const json = await aiRes.json();
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  }

  if (lovableKey) {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "Você é um copywriter especializado em e-commerce B2B de suprimentos de impressão. Escreva descrições claras, comerciais e confiáveis em português do Brasil.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`Lovable AI ${aiRes.status}: ${txt.slice(0, 300)}`);
    }

    const json = await aiRes.json();
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  }

  throw new Error(
    "Nenhuma chave de IA configurada. Cadastre OPENAI_API_KEY nos Secrets do Supabase/Lovable, ou use LOVABLE_API_KEY."
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase env vars missing" }, 500);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: roleRow, error: roleErr } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr) throw roleErr;
    if (!roleRow) return jsonResponse({ error: "Forbidden" }, 403);

    const body: ReqBody = await req.json().catch(() => ({}));
    const db = createClient(supabaseUrl, supabaseServiceKey);

    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);

    let query = db
      .from("products")
      .select("id, name, code, brand, description, categories(name)")
      .order("created_at", { ascending: false });

    if (body.product_ids && body.product_ids.length > 0) {
      query = query.in("id", body.product_ids);
    } else if (!body.overwrite) {
      query = query.or("description.is.null,description.eq.");
    }

    const { data: products, error } = await query.limit(limit);
    if (error) throw error;

    if (!products || products.length === 0) {
      return jsonResponse({ ok: true, updated: 0, total: 0, errors: [], message: "Nada para gerar" });
    }

    let updated = 0;
    const errors: { id: string; name?: string; error: string }[] = [];

    for (const p of products) {
      try {
        const categoryName = (p as any).categories?.name ?? "";
        const prompt = `Gere uma descrição comercial curta, de 60 a 90 palavras, em português do Brasil, para este produto de suprimentos de impressão.\n\nRegras:\n- Não use markdown.\n- Não invente rendimento, compatibilidade ou especificações que não estejam claras.\n- Se o produto for toner, cartucho, cilindro ou refil, destaque qualidade, aplicação profissional e compatibilidade pelo nome/modelo quando possível.\n- Texto direto para catálogo B2B.\n\nNome: ${p.name}\nCódigo: ${p.code ?? "-"}\nMarca: ${p.brand ?? "-"}\nCategoria: ${categoryName || "-"}`;

        const description = await generateDescription(prompt);

        if (!description) {
          errors.push({ id: p.id, name: p.name, error: "Resposta vazia da IA" });
          continue;
        }

        const { error: upErr } = await db.from("products").update({ description }).eq("id", p.id);

        if (upErr) {
          errors.push({ id: p.id, name: p.name, error: upErr.message });
        } else {
          updated++;
        }
      } catch (e) {
        const msg = (e as Error).message;
        errors.push({ id: p.id, name: p.name, error: msg });

        // Para não gastar tentativas quando o problema é chave, crédito ou limite.
        if (
          msg.includes("401") ||
          msg.includes("402") ||
          msg.includes("403") ||
          msg.includes("429") ||
          msg.includes("Nenhuma chave")
        ) {
          break;
        }
      }
    }

    return jsonResponse({
      ok: errors.length === 0,
      updated,
      total: products.length,
      errors,
      provider: Deno.env.get("OPENAI_API_KEY") ? "openai" : Deno.env.get("LOVABLE_API_KEY") ? "lovable" : "none",
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
