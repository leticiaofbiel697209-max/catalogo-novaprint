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

interface ProductRow {
  id: string;
  name: string;
  code: string | null;
  brand: string | null;
  description: string | null;
  categories?: { name?: string | null } | null;
}

const clean = (value?: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

const sentence = (value: string) => {
  const text = clean(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const categoryText = (name: string, category: string) => {
  const source = `${name} ${category}`.toLowerCase();

  if (/toner|cartucho|cilindro|fotocondutor|tinta|refil/.test(source)) {
    return "Indicado para rotinas de impressão em escritórios, empresas e ambientes profissionais, oferecendo uma opção prática para reposição de suprimentos.";
  }
  if (/papel|etiqueta|bobina|envelope|bloco|caderno/.test(source)) {
    return "Adequado para uso administrativo, comercial e operacional, auxiliando nas atividades diárias de organização, impressão e identificação.";
  }
  if (/mouse|teclado|monitor|notebook|computador|cabo|adaptador|headset|informática|informatica/.test(source)) {
    return "Desenvolvido para uso em ambientes corporativos e estações de trabalho, contribuindo para uma rotina mais organizada e produtiva.";
  }
  if (/limpeza|detergente|desinfetante|álcool|alcool|saco|papel higiênico|papel higienico/.test(source)) {
    return "Recomendado para rotinas de limpeza, conservação e abastecimento de empresas, escritórios e outros ambientes profissionais.";
  }
  if (/caneta|lápis|lapis|grampeador|grampo|pasta|arquivo|escritório|escritorio/.test(source)) {
    return "Ideal para organização e uso cotidiano em escritórios, empresas, escolas e setores administrativos.";
  }

  return "Produto indicado para uso profissional e corporativo, atendendo às necessidades do dia a dia com praticidade.";
};

const buildDescription = (product: ProductRow) => {
  const name = clean(product.name) || "Produto";
  const brand = clean(product.brand);
  const code = clean(product.code);
  const category = clean(product.categories?.name);

  const details: string[] = [];
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) details.push(`da marca ${brand}`);
  if (code && !name.toLowerCase().includes(code.toLowerCase())) details.push(`código ${code}`);
  if (category) details.push(`da categoria ${category}`);

  const intro = details.length
    ? `${name}, ${details.join(", ")}`
    : name;

  return [
    sentence(intro),
    categoryText(name, category),
    "Antes da compra, confira as informações do modelo, medida, cor ou compatibilidade indicadas no nome do produto.",
  ].join(" ");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ReqBody = await req.json().catch(() => ({}));
    const db = createClient(supabaseUrl, supabaseServiceKey);

    let query = db
      .from("products")
      .select("id, name, code, brand, description, categories(name)");

    if (body.product_ids?.length) {
      query = query.in("id", body.product_ids);
    } else if (!body.overwrite) {
      query = query.or("description.is.null,description.eq.");
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 500) || 500, 1), 500);
    const { data: products, error } = await query.limit(limit);
    if (error) throw error;

    if (!products?.length) {
      return new Response(JSON.stringify({ ok: true, updated: 0, total: 0, errors: [], message: "Nada para gerar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const errors: { id: string; error: string }[] = [];

    for (const product of products as ProductRow[]) {
      try {
        if (!body.overwrite && clean(product.description)) continue;

        const description = buildDescription(product);
        const { error: updateError } = await db
          .from("products")
          .update({ description })
          .eq("id", product.id);

        if (updateError) errors.push({ id: product.id, error: updateError.message });
        else updated += 1;
      } catch (error) {
        errors.push({ id: product.id, error: (error as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, updated, total: products.length, errors, mode: "local_templates" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
