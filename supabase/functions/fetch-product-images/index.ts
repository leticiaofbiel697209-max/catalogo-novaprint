// Edge Function: fetch-product-images
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

interface ProductForImage {
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

interface ImageCandidate extends RawCandidate {
  score: number;
  reviewReasons: string[];
}

interface DownloadedImage {
  bytes: Uint8Array;
  contentType: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_RESULTS_PER_QUERY = 50;
const DEFAULT_LIMIT = 50;

const NSFW_KEYWORDS = [
  "porn", "porno", "xxx", "sex", "sexo", "nude", "nudes", "naked", "erotic", "erotico", "erótico",
  "adult", "adulto", "hentai", "xvideos", "xnxx", "xhamster", "redtube", "pornhub", "youporn",
  "onlyfans", "camgirl", "escort", "acompanhante", "boobs", "bunda", "pussy", "penis", "vagina",
  "anal", "fetish", "fetiche", "bdsm", "milf", "cumshot",
];

const BAD_IMAGE_DOMAINS = [
  "facebook.com", "instagram.com", "pinterest.", "tiktok.com", "youtube.com", "x.com", "twitter.com",
  "blogspot.", "wordpress.", "tumblr.", "reddit.com", "shutterstock.com", "istockphoto.com", "alamy.com",
  "gettyimages", "dreamstime.com", "depositphotos.com",
];

const PREFERRED_IMAGE_DOMAINS = [
  "hp.com", "brother.com", "epson.com", "canon.com", "xerox.com", "lexmark.com", "ricoh.com", "kyocera",
  "samsung.com", "oki.com", "pantum.com", "kalunga.com.br", "kabum.com.br", "magazineluiza.com.br",
  "mercadolivre.com.br", "amazon.com.br", "dell.com", "multilaser.com.br", "intelbras.com", "logitech.com",
  "3m.com", "termolar.com.br", "tramontina.com.br", "tilibra.com.br", "faber-castell.com.br",
];

const GENERIC_WORDS = new Set([
  "produto", "produtos", "compativel", "compatível", "original", "promo", "promocao", "promoção", "preto",
  "black", "branco", "colorido", "magenta", "cyan", "ciano", "yellow", "amarelo", "unidade", "unidades",
  "novo", "nova", "para", "com", "sem", "kit", "cx", "caixa", "und", "un", "ml", "kg", "a4", "oficio",
  "ofício", "pct", "pacote", "pote", "frasco", "rolo", "folha", "folhas",
]);

function clean(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'")
    .replace(/\\u002f/gi, "/").replace(/\\\//g, "/");
}

function looksNSFW(text: string): boolean {
  const normalized = normalizeText(text);
  return NSFW_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function hasBadDomain(url: string): boolean {
  const normalized = url.toLowerCase();
  return BAD_IMAGE_DOMAINS.some((domain) => normalized.includes(domain));
}

function hasPreferredDomain(url: string): boolean {
  const normalized = url.toLowerCase();
  return PREFERRED_IMAGE_DOMAINS.some((domain) => normalized.includes(domain));
}

function productTokens(product: ProductForImage): string[] {
  return normalizeText([product.brand, product.code, product.name].filter(Boolean).join(" "))
    .split(/\s+/).filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token)).slice(0, 16);
}

function modelTokens(product: ProductForImage): string[] {
  return normalizeText([product.code, product.name].filter(Boolean).join(" "))
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token))
    .filter((token) => (/[a-z]/.test(token) && /\d/.test(token)) || /^\d{2,}[a-z]+$/i.test(token))
    .slice(0, 10);
}

function buildQueries(product: ProductForImage): string[] {
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
    `${compactName} catálogo`,
  ].map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query, index, all) => query && all.indexOf(query) === index);
}

function evaluateCandidate(product: ProductForImage, candidate: RawCandidate): ImageCandidate {
  const haystack = normalizeText(`${candidate.title} ${candidate.desc} ${candidate.url}`);
  const compactHaystack = haystack.replace(/\s+/g, "");
  const tokens = productTokens(product);
  const models = modelTokens(product);
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  const matchedModels = models.filter((token) => compactHaystack.includes(token.replace(/\s+/g, "")));
  const code = normalizeText(product.code ?? "").replace(/\s+/g, "");
  const brand = normalizeText(product.brand ?? "");
  const strongIdentifier = Boolean(code && code.length >= 3 && compactHaystack.includes(code)) || matchedModels.length > 0;

  let score = matchedTokens.length * 1.25 + matchedModels.length * 4;
  if (code && code.length >= 3 && compactHaystack.includes(code)) score += 9;
  if (brand && brand.length >= 3 && haystack.includes(brand)) score += 3;
  if (hasPreferredDomain(candidate.url)) score += 2;
  if (candidate.source === "bing-json") score += 0.5;

  const reviewReasons: string[] = [];
  if (looksNSFW(haystack)) reviewReasons.push("Possível conteúdo impróprio");
  if (hasBadDomain(candidate.url)) reviewReasons.push("Fonte exige revisão");
  if (!strongIdentifier || matchedTokens.length < 2) reviewReasons.push("Baixa correspondência com o produto");

  return { ...candidate, score, reviewReasons: [...new Set(reviewReasons)] };
}

function addCandidate(target: RawCandidate[], candidate: RawCandidate): void {
  const url = clean(candidate.url);
  if (!/^https?:\/\//i.test(url) || url.startsWith("data:")) return;
  if (target.some((item) => item.url === url)) return;
  target.push({ ...candidate, url });
}

function parseBingHtml(html: string): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const metadataRegex = /\bm=["']([^"']+)["']/g;
  let metadataMatch: RegExpExecArray | null;
  while ((metadataMatch = metadataRegex.exec(html)) !== null && candidates.length < MAX_RESULTS_PER_QUERY) {
    try {
      const data = JSON.parse(decodeHtml(metadataMatch[1]));
      addCandidate(candidates, {
        url: String(data.murl ?? data.mediaUrl ?? ""),
        title: String(data.t ?? data.title ?? ""),
        desc: String(data.desc ?? data.description ?? ""),
        source: "bing-json",
      });
    } catch { /* ignora metadado inválido */ }
  }

  const jsonUrlRegex = /["'](?:murl|mediaUrl)["']\s*:\s*["']([^"']+)["']/gi;
  let jsonUrlMatch: RegExpExecArray | null;
  while ((jsonUrlMatch = jsonUrlRegex.exec(html)) !== null && candidates.length < MAX_RESULTS_PER_QUERY) {
    addCandidate(candidates, { url: decodeHtml(jsonUrlMatch[1]), title: "", desc: "", source: "bing-fallback-json" });
  }
  return candidates;
}

async function searchBing(query: string): Promise<{ candidates: RawCandidate[]; error?: string }> {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&safeSearch=Off&adlt=off`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Cookie": "SRCHHPGUSR=ADLT=OFF&ADLT_SET=1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { candidates: [], error: `Bing HTTP ${response.status}` };
    const html = await response.text();
    if (/captcha|unusual traffic|verify you are human/i.test(html)) return { candidates: [], error: "Bing bloqueou temporariamente a consulta" };
    const candidates = parseBingHtml(html);
    return { candidates, error: candidates.length ? undefined : "Bing não retornou URLs de imagem reconhecíveis" };
  } catch (error) {
    return { candidates: [], error: error instanceof Error ? error.message : "Falha ao consultar Bing" };
  }
}

async function downloadImage(url: string): Promise<{ image?: DownloadedImage; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "Referer": new URL(url).origin },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { error: `Download HTTP ${response.status}` };
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return { error: `Conteúdo recebido não é imagem (${contentType || "sem tipo"})` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1000) return { error: "Imagem muito pequena" };
    if (bytes.byteLength > 8_000_000) return { error: "Imagem maior que 8 MB" };
    return { image: { bytes, contentType } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha no download" };
  }
}

async function findDownloadableImage(product: ProductForImage): Promise<{ image?: DownloadedImage; candidate?: ImageCandidate; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const candidates: ImageCandidate[] = [];
  for (const query of buildQueries(product)) {
    const result = await searchBing(query);
    if (result.error) diagnostics.push(`${query}: ${result.error}`);
    for (const raw of result.candidates) {
      if (!candidates.some((candidate) => candidate.url === raw.url)) candidates.push(evaluateCandidate(product, raw));
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return { diagnostics: [...diagnostics, "Nenhum candidato de imagem foi encontrado"] };

  for (const candidate of candidates) {
    const download = await downloadImage(candidate.url);
    if (download.image) return { image: download.image, candidate, diagnostics };
    diagnostics.push(`${candidate.url.slice(0, 100)}: ${download.error ?? "download recusado"}`);
  }
  return { diagnostics: [...diagnostics, "Todos os candidatos encontrados recusaram o download"] };
}

function extensionFromContentType(contentType: string): string {
  const normalized = (contentType.split("/")[1] ?? "jpeg").split("+")[0].split(";")[0].toLowerCase();
  if (normalized === "jpeg") return "jpg";
  return ["png", "webp", "gif", "avif"].includes(normalized) ? normalized : "jpg";
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

    const body: ReqBody = await req.json().catch(() => ({}));
    const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), 100);
    let query = db.from("products").select("id, name, code, brand, image_url");
    if (body.product_ids?.length) query = query.in("id", body.product_ids);
    else if (!body.overwrite) query = query.or("image_url.is.null,image_url.eq.");

    const { data: products, error: productsError } = await query.limit(limit);
    if (productsError) throw productsError;

    let updated = 0;
    const errors: unknown[] = [];
    for (const product of (products ?? []) as ProductForImage[]) {
      try {
        if (!body.overwrite && clean(product.image_url)) continue;
        const result = await findDownloadableImage(product);
        if (!result.image || !result.candidate) {
          errors.push({ id: product.id, product: product.name, error: "Nenhuma imagem válida encontrada", diagnostics: result.diagnostics.slice(0, 6) });
          continue;
        }

        const path = `auto/${product.id}.${extensionFromContentType(result.image.contentType)}`;
        const { error: uploadError } = await db.storage.from("product-images").upload(path, result.image.bytes, { contentType: result.image.contentType, upsert: true, cacheControl: "31536000" });
        if (uploadError) throw uploadError;
        const { data: publicData } = db.storage.from("product-images").getPublicUrl(path);
        const reasons = result.candidate.reviewReasons.length ? result.candidate.reviewReasons : ["Imagem encontrada automaticamente — revisar antes de aprovar"];

        const { error: updateError } = await db.from("products").update({
          image_url: publicData.publicUrl,
          image_source_url: result.candidate.url,
          image_review_status: "suspect",
          image_review_note: reasons.join("; "),
        }).eq("id", product.id);
        if (updateError) throw updateError;
        updated += 1;
      } catch (error) {
        errors.push({ id: product.id, product: product.name, error: error instanceof Error ? error.message : "Erro desconhecido" });
      }
    }

    return new Response(JSON.stringify({ ok: true, updated, total: products?.length ?? 0, failed: errors.length, errors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});