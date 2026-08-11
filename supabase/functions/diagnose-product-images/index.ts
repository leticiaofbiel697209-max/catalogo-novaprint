// Edge Function: diagnose-product-images
// Read-only diagnostic for automatic image search. Never writes product or storage data.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MIN_ACCEPTABLE_SCORE = 4.5;
const MAX_PRODUCTS = 5;
const MAX_CANDIDATES_TO_TEST = 5;

interface Product {
  id: string;
  name: string;
  code: string | null;
  brand: string | null;
  image_url: string | null;
}

interface RawCandidate {
  url: string;
  title: string;
  desc: string;
  source: string;
}

const GENERIC_WORDS = new Set([
  "produto", "produtos", "compativel", "compatível", "original", "preto", "black", "branco", "colorido",
  "magenta", "cyan", "ciano", "yellow", "amarelo", "unidade", "unidades", "novo", "nova", "para", "com",
  "sem", "kit", "cx", "caixa", "und", "un", "ml", "kg", "a4", "oficio", "ofício", "pct", "pacote",
  "pote", "frasco", "rolo", "folha", "folhas",
]);

function clean(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'")
    .replace(/\\u002f/gi, "/").replace(/\\\//g, "/");
}

function buildQueries(product: Product) {
  const name = clean(product.name);
  const brand = clean(product.brand);
  const code = clean(product.code);
  const compactName = name.split(/\s+/).slice(0, 12).join(" ");
  return [
    code && brand ? `"${brand}" "${code}"` : "",
    code ? `"${code}" ${brand} produto` : "",
    brand ? `${brand} ${compactName}` : compactName,
    `${compactName} foto produto`,
    `${compactName} imagem fundo branco`,
  ].map((q) => q.replace(/\s+/g, " ").trim()).filter((q, i, all) => q && all.indexOf(q) === i);
}

function productTokens(product: Product) {
  return normalizeText([product.brand, product.code, product.name].filter(Boolean).join(" "))
    .split(/\s+/).filter((t) => t.length >= 3 && !GENERIC_WORDS.has(t)).slice(0, 16);
}

function modelTokens(product: Product) {
  return normalizeText([product.code, product.name].filter(Boolean).join(" "))
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !GENERIC_WORDS.has(t))
    .filter((t) => (/[a-z]/.test(t) && /\d/.test(t)) || /^\d{2,}[a-z]+$/i.test(t))
    .slice(0, 10);
}

function scoreCandidate(product: Product, candidate: RawCandidate) {
  const haystack = normalizeText(`${candidate.title} ${candidate.desc} ${candidate.url}`);
  const compact = haystack.replace(/\s+/g, "");
  const tokens = productTokens(product);
  const models = modelTokens(product);
  const matchedTokens = tokens.filter((t) => haystack.includes(t));
  const matchedModels = models.filter((t) => compact.includes(t.replace(/\s+/g, "")));
  const code = normalizeText(product.code ?? "").replace(/\s+/g, "");
  const brand = normalizeText(product.brand ?? "");
  let score = matchedTokens.length * 1.25 + matchedModels.length * 4;
  if (code && code.length >= 3 && compact.includes(code)) score += 9;
  if (brand && brand.length >= 3 && haystack.includes(brand)) score += 3;
  if (candidate.source === "bing-json") score += 0.5;
  return { score, matchedTokens, matchedModels };
}

function parseBingHtml(html: string) {
  const candidates: RawCandidate[] = [];
  const add = (candidate: RawCandidate) => {
    const url = clean(candidate.url);
    if (!/^https?:\/\//i.test(url) || candidates.some((c) => c.url === url)) return;
    candidates.push({ ...candidate, url });
  };

  const metadataRegex = /\bm=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = metadataRegex.exec(html)) !== null && candidates.length < 50) {
    try {
      const data = JSON.parse(decodeHtml(match[1]));
      add({ url: String(data.murl ?? data.mediaUrl ?? ""), title: String(data.t ?? data.title ?? ""), desc: String(data.desc ?? data.description ?? ""), source: "bing-json" });
    } catch { /* diagnostic only */ }
  }

  const fallback = /["'](?:murl|mediaUrl)["']\s*:\s*["']([^"']+)["']/gi;
  while ((match = fallback.exec(html)) !== null && candidates.length < 50) {
    add({ url: decodeHtml(match[1]), title: "", desc: "", source: "bing-fallback-json" });
  }
  return candidates;
}

async function bingProbe(query: string) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&safeSearch=Strict&adlt=strict`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Cookie": "SRCHHPGUSR=ADLT=STRICT&ADLT_SET=1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const html = await response.text();
    const blocked = /captcha|unusual traffic|verify you are human/i.test(html);
    const candidates = response.ok && !blocked ? parseBingHtml(html) : [];
    return {
      query,
      httpStatus: response.status,
      elapsedMs: Date.now() - started,
      htmlBytes: html.length,
      blocked,
      candidateCount: candidates.length,
      candidates,
      error: !response.ok ? `Bing HTTP ${response.status}` : blocked ? "Bing bloqueou temporariamente a consulta" : candidates.length === 0 ? "Parser não encontrou URLs de imagem no HTML" : null,
    };
  } catch (error) {
    return { query, httpStatus: null, elapsedMs: Date.now() - started, htmlBytes: 0, blocked: false, candidateCount: 0, candidates: [] as RawCandidate[], error: error instanceof Error ? error.message : "Falha ao consultar Bing" };
  }
}

async function downloadProbe(url: string) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "Referer": new URL(url).origin },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    let bytes = 0;
    if (response.ok && contentType.startsWith("image/")) bytes = (await response.arrayBuffer()).byteLength;
    return {
      ok: response.ok && contentType.startsWith("image/") && bytes >= 1000 && bytes <= 8_000_000,
      status: response.status,
      contentType,
      bytes,
      elapsedMs: Date.now() - started,
      error: !response.ok ? `HTTP ${response.status}` : !contentType.startsWith("image/") ? `Conteúdo não é imagem (${contentType || "sem tipo"})` : bytes < 1000 ? "Imagem muito pequena" : bytes > 8_000_000 ? "Imagem maior que 8 MB" : null,
    };
  } catch (error) {
    return { ok: false, status: null, contentType: "", bytes: 0, elapsedMs: Date.now() - started, error: error instanceof Error ? error.message : "Falha no download" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roleRow } = await authClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const limit = Math.min(Math.max(Number(body.limit ?? MAX_PRODUCTS) || MAX_PRODUCTS, 1), MAX_PRODUCTS);
    let query = db.from("products").select("id,name,code,brand,image_url");
    if (Array.isArray(body.product_ids) && body.product_ids.length) query = query.in("id", body.product_ids.slice(0, MAX_PRODUCTS));
    else query = query.or("image_url.is.null,image_url.eq.");
    const { data: products, error: productsError } = await query.limit(limit);
    if (productsError) throw productsError;

    const results = [];
    for (const product of (products ?? []) as Product[]) {
      const queryResults = [];
      const allCandidates: Array<RawCandidate & { score: number; matchedTokens: string[]; matchedModels: string[] }> = [];
      for (const searchQuery of buildQueries(product)) {
        const probe = await bingProbe(searchQuery);
        queryResults.push({ query: probe.query, httpStatus: probe.httpStatus, elapsedMs: probe.elapsedMs, htmlBytes: probe.htmlBytes, blocked: probe.blocked, candidateCount: probe.candidateCount, error: probe.error });
        for (const candidate of probe.candidates) {
          if (allCandidates.some((c) => c.url === candidate.url)) continue;
          const scored = scoreCandidate(product, candidate);
          allCandidates.push({ ...candidate, ...scored });
        }
      }

      allCandidates.sort((a, b) => b.score - a.score);
      const eligible = allCandidates.filter((c) => c.score >= MIN_ACCEPTABLE_SCORE);
      const downloadTests = [];
      for (const candidate of eligible.slice(0, MAX_CANDIDATES_TO_TEST)) {
        downloadTests.push({ url: candidate.url, score: candidate.score, ...(await downloadProbe(candidate.url)) });
      }

      const usable = downloadTests.find((d) => d.ok);
      let diagnosis = "ok";
      if (queryResults.some((q) => q.blocked)) diagnosis = "bing_blocked";
      else if (queryResults.every((q) => q.candidateCount === 0)) diagnosis = "parser_zero_candidates";
      else if (eligible.length === 0) diagnosis = "score_rejected_all";
      else if (!usable) diagnosis = "downloads_rejected";

      results.push({
        product: { id: product.id, name: product.name, code: product.code, brand: product.brand },
        diagnosis,
        minAcceptableScore: MIN_ACCEPTABLE_SCORE,
        rawCandidates: allCandidates.length,
        eligibleCandidates: eligible.length,
        bestCandidates: allCandidates.slice(0, 5).map((c) => ({ url: c.url, score: c.score, source: c.source, matchedTokens: c.matchedTokens, matchedModels: c.matchedModels })),
        queries: queryResults,
        downloads: downloadTests,
      });
    }

    const summary = results.reduce((acc: Record<string, number>, item) => {
      acc[item.diagnosis] = (acc[item.diagnosis] ?? 0) + 1;
      return acc;
    }, {});

    return new Response(JSON.stringify({ ok: true, dryRun: true, writesPerformed: 0, tested: results.length, summary, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});