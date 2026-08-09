import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Product = { id: string; name: string; code: string | null; brand: string | null; description: string | null; category_id: string | null };
type Rule = { category: string; keywords: string[]; weight?: number };

const TAXONOMY = [
  "Toners e Cartuchos",
  "Impressoras e Multifuncionais",
  "Papéis e Etiquetas",
  "Papelaria e Escrita",
  "Organização e Arquivo",
  "Informática e Periféricos",
  "Rede e Conectividade",
  "Móveis e Ergonomia",
  "Limpeza e Higiene",
  "Copa e Utilidades",
  "Embalagens e Expedição",
  "Outros",
];

const RULES: Rule[] = [
  { category: "Toners e Cartuchos", keywords: ["toner", "cartucho", "cilindro", "drum", "fotocondutor", "unidade de imagem", "refil de tinta", "tinta impressora"], weight: 4 },
  { category: "Impressoras e Multifuncionais", keywords: ["impressora", "multifuncional", "plotter", "scanner", "copiadora"], weight: 4 },
  { category: "Papéis e Etiquetas", keywords: ["papel a4", "papel sulfite", "papel couche", "papel couchê", "etiqueta", "bobina etiqueta", "papel termico", "papel térmico", "papel fotográfico", "papel foto"], weight: 4 },
  { category: "Papelaria e Escrita", keywords: ["caneta", "marcador", "marca texto", "marcatexto", "lapis", "lápis", "borracha", "corretivo", "apontador", "caderno", "bloco adesivo", "post-it", "grampeador", "grampo", "clips", "clipe"], weight: 3 },
  { category: "Organização e Arquivo", keywords: ["pasta", "arquivo", "fichario", "fichário", "organizador", "caixa arquivo", "classificador", "envelope"], weight: 3 },
  { category: "Informática e Periféricos", keywords: ["mouse", "teclado", "webcam", "monitor", "notebook", "computador", "headset", "fone", "ssd", "hd externo", "pendrive", "tablet", "ipad", "carregador", "hub usb"], weight: 3 },
  { category: "Rede e Conectividade", keywords: ["switch", "roteador", "access point", "unifi", "ubiquiti", "mikrotik", "cabo de rede", "cat5", "cat6", "patch cord", "bridge", "wifi", "wi-fi"], weight: 4 },
  { category: "Móveis e Ergonomia", keywords: ["cadeira", "mesa", "apoio lombar", "apoio para pés", "ergonom", "gaveteiro", "armario", "armário"], weight: 4 },
  { category: "Limpeza e Higiene", keywords: ["detergente", "desinfetante", "alcool", "álcool", "sabonete", "papel higienico", "papel higiênico", "papel toalha", "saco de lixo", "lixeira", "vassoura", "rodo", "esponja", "limpeza", "higiene"], weight: 3 },
  { category: "Copa e Utilidades", keywords: ["copo", "garrafa", "cafe", "café", "açucar", "açúcar", "adoçante", "guardanapo", "prato", "talher", "termica", "térmica"], weight: 3 },
  { category: "Embalagens e Expedição", keywords: ["fita adesiva", "fita embalagem", "plastico bolha", "plástico bolha", "stretch", "sacola", "caixa papelao", "caixa papelão", "embalagem", "etiqueta envio"], weight: 3 },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function classify(product: Product) {
  const text = normalize([product.name, product.code, product.brand, product.description].filter(Boolean).join(" "));
  let best: { category: string; score: number; matches: string[] } | null = null;
  for (const rule of RULES) {
    const matches = rule.keywords.filter((k) => text.includes(normalize(k)));
    if (!matches.length) continue;
    const score = matches.length * (rule.weight ?? 1);
    if (!best || score > best.score) best = { category: rule.category, score, matches };
  }
  if (!best) return null;
  const confidence = Math.min(99, 55 + best.score * 7 + Math.min(12, best.matches.length * 3));
  return { category: best.category, confidence, rule: best.matches.slice(0, 5).join(", ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: role } = await authClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);
    const db = createClient(url, service);

    const { data: existingCategories, error: catErr } = await db.from("categories").select("id,name");
    if (catErr) throw catErr;
    const byName = new Map((existingCategories ?? []).map((c: any) => [normalize(c.name), c.id]));
    for (const name of TAXONOMY) {
      if (byName.has(normalize(name))) continue;
      const { data, error } = await db.from("categories").insert({ name, description: "Categoria padronizada NovaPrint", active: true }).select("id").single();
      if (error) throw error;
      byName.set(normalize(name), data.id);
    }

    let query = db.from("products").select("id,name,code,brand,description,category_id").is("category_id", null).limit(limit);
    if (Array.isArray(body.product_ids) && body.product_ids.length) query = query.in("id", body.product_ids);
    const { data: products, error: productErr } = await query;
    if (productErr) throw productErr;

    let suggested = 0, unresolved = 0;
    const errors: any[] = [];
    for (const product of (products ?? []) as Product[]) {
      try {
        const result = classify(product);
        if (!result) { unresolved++; continue; }
        const categoryId = byName.get(normalize(result.category));
        if (!categoryId) { unresolved++; continue; }
        const { error } = await db.from("products").update({
          suggested_category_id: categoryId,
          category_confidence: result.confidence,
          category_rule: result.rule,
          category_review_status: "suggested",
        }).eq("id", product.id);
        if (error) throw error;
        suggested++;
      } catch (e) {
        errors.push({ id: product.id, error: e instanceof Error ? e.message : "Erro desconhecido" });
      }
    }

    const { count: remaining } = await db.from("products").select("id", { count: "exact", head: true }).is("category_id", null).neq("category_review_status", "suggested");
    return json({ ok: true, processed: products?.length ?? 0, suggested, unresolved, remaining: remaining ?? 0, errors });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
