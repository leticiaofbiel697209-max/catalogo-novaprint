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
  image_review_status?: string | null;
  image_rejected_sources?: string[] | null;
}

interface RawCandidate {
  url: string;
  title: string;
  desc: string;
  source: string;
}

interface ImageCandidate extends RawCandidate {
  score: number;
}

interface DownloadedImage {
  bytes: Uint8Array;
  contentType: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DEFAULT_LIMIT = 10;
const MAX_PRODUCTS_PER_REQUEST = 10;
const MAX_PAGE_URLS = 6;
const MAX_PAGES_TO_INSPECT = 5;

const NSFW_KEYWORDS = [
  "porn", "porno", "xxx", "sex", "sexo", "nude", "nudes", "naked", "erotic", "erotico", "erótico",
  "adult", "adulto", "hentai", "xvideos", "xnxx", "xhamster", "redtube", "pornhub", "youporn",
  "onlyfans", "camgirl", "escort", "acompanhante", "boobs", "pussy", "penis", "vagina", "bdsm",
];

const BAD_DOMAINS = [
  "facebook.com", "instagram.com", "pinterest.", "tiktok.com", "youtube.com", "twitter.com", "x.com",
  "blogspot.", "wordpress.", "tumblr.", "reddit.com", "shutterstock.com", "istockphoto.com", "alamy.com",
  "gettyimages", "dreamstime.com", "depositphotos.com",
];

const PREFERRED_DOMAINS = [
  "hp.com", "brother.com", "epson.com", "canon.com", "xerox.com", "lexmark.com", "ricoh.com", "kyocera",
  "samsung.com", "oki.com", "pantum.com", "dell.com", "intelbras.com", "logitech.com", "3m.com",
  "kalunga.com.br", "kabum.com.br", "magazineluiza.com.br", "mercadolivre.com.br", "amazon.com.br",
  "multilaser.com.br", "termolar.com.br", "tramontina.com.br", "tilibra.com.br", "faber-castell.com.br",
];

const GENERIC_IMAGE_HINTS = [
  "logo", "logotipo", "icon", "icone", "favicon", "banner", "placeholder", "no-image", "sem-imagem",
  "default-image", "sprite", "watermark", "marca-dagua",
];

const GENERIC_WORDS = new Set([
  "produto", "produtos", "compativel", "compatível", "original", "preto", "black", "branco", "colorido",
  "magenta", "cyan", "ciano", "yellow", "amarelo", "unidade", "unidades", "novo", "nova", "para", "com",
  "sem", "kit", "caixa", "und", "ml", "kg", "pct", "pacote", "pote", "frasco", "rolo", "folha", "folhas",
]);

function clean(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function looksNSFW(value: string): boolean {
  const text = ` ${normalizeText(value)} `;
  return NSFW_KEYWORDS.some((word) => text.includes(` ${normalizeText(word)} `));
}

function hasBadDomain(url: string): boolean {
  const value = url.toLowerCase();
  return BAD_DOMAINS.some((domain) => value.includes(domain));
}

function hasPreferredDomain(url: string): boolean {
  const value = url.toLowerCase();
  return PREFERRED_DOMAINS.some((domain) => value.includes(domain));
}

function looksGenericImage(url: string): boolean {
  const value = url.toLowerCase();
  return GENERIC_IMAGE_HINTS.some((hint) => value.includes(hint));
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
  const name = clean(product.name).split(/\s+/).slice(0, 10).join(" ");
  const brand = clean(product.brand);
  const code = clean(product.code);
  const models = modelTokens(product).slice(0, 2).join(" ");
  return [
    code ? `${brand} "${code}" ${name}` : "",
    models ? `${brand} ${models} ${name}` : "",
    `${brand} ${name}`,
  ].map((q) => q.replace(/\s+/g, " ").trim()).filter((q, i, all) => q && all.indexOf(q) === i && !looksNSFW(q));
}

function scoreCandidate(product: ProductForImage, candidate: RawCandidate): number {
  const haystack = normalizeText(`${candidate.title} ${candidate.desc} ${candidate.url}`);
  const compact = haystack.replace(/\s+/g, "");
  const tokens = productTokens(product);
  const models = modelTokens(product);
  const code = normalizeText(product.code ?? "").replace(/\s+/g, "");
  const brand = normalizeText(product.brand ?? "");
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  const matchedModels = models.filter((token) => compact.includes(token.replace(/\s+/g, "")));

  let score = matchedTokens.length * 1.1 + matchedModels.length * 7;
  if (code && code.length >= 3 && compact.includes(code)) score += 16;
  if (brand && brand.length >= 3 && haystack.includes(brand)) score += 4;
  if (hasPreferredDomain(candidate.desc)) score += 4;
  if (candidate.source.startsWith("page:")) score += 2;
  if (candidate.source === "bing-images-fallback") score -= 2;
  if (hasBadDomain(candidate.url)) score -= 10;
  if (looksGenericImage(candidate.url)) score -= 8;
  if (looksNSFW(`${candidate.url} ${candidate.title} ${candidate.desc}`)) score -= 100;

  const strong = Boolean(code && compact.includes(code)) || matchedModels.length > 0;
  if (!strong && matchedTokens.length < 2) score -= 4;
  if (brand && !haystack.includes(brand) && !strong) score -= 3;
  return score;
}

function uniquePush(target: string[], url: string): void {
  const value = clean(url);
  if (!/^https?:\/\//i.test(value) || hasBadDomain(value) || looksNSFW(value)) return;
  if (!target.includes(value)) target.push(value);
}

function unwrapDuckDuckGoUrl(raw: string): string {
  try {
    const decoded = decodeHtml(raw);
    const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded;
    const url = new URL(absolute, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return "";
  }
}

async function searchDuckDuckGo(query: string): Promise<{ urls: string[]; error?: string }> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kp=1`;
    const response = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return { urls: [], error: `DuckDuckGo HTTP ${response.status}` };
    const html = await response.text();
    const urls: string[] = [];
    const regex = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) && urls.length < MAX_PAGE_URLS) uniquePush(urls, unwrapDuckDuckGoUrl(match[1]));
    return { urls, error: urls.length ? undefined : "DuckDuckGo não retornou páginas úteis" };
  } catch (error) {
    return { urls: [], error: error instanceof Error ? error.message : "Falha no DuckDuckGo" };
  }
}

async function searchBingWeb(query: string): Promise<{ urls: string[]; error?: string }> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&adlt=strict&count=8`;
    const response = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return { urls: [], error: `Bing Web HTTP ${response.status}` };
    const html = await response.text();
    const urls: string[] = [];
    const regex = /<li[^>]*class=["'][^"']*b_algo[^"']*["'][\s\S]*?<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) && urls.length < MAX_PAGE_URLS) uniquePush(urls, decodeHtml(match[1]));
    return { urls, error: urls.length ? undefined : "Bing Web não retornou páginas úteis" };
  } catch (error) {
    return { urls: [], error: error instanceof Error ? error.message : "Falha no Bing Web" };
  }
}

function attr(tag: string, name: string): string {
  const regex = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return decodeHtml(regex.exec(tag)?.[1] ?? "");
}

function resolveUrl(value: string, base: string): string {
  try { return new URL(decodeHtml(value), base).toString(); } catch { return ""; }
}

function collectJsonLdImages(value: unknown, target: string[], pageUrl: string): void {
  if (!value) return;
  if (Array.isArray(value)) { value.forEach((item) => collectJsonLdImages(item, target, pageUrl)); return; }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const type = Array.isArray(obj["@type"]) ? (obj["@type"] as unknown[]).join(" ") : String(obj["@type"] ?? "");
  if (/product/i.test(type) && obj.image) {
    const images = Array.isArray(obj.image) ? obj.image : [obj.image];
    for (const image of images) {
      if (typeof image === "string") uniquePush(target, resolveUrl(image, pageUrl));
      else if (image && typeof image === "object") {
        const imageObj = image as Record<string, unknown>;
        const raw = String(imageObj.url ?? imageObj.contentUrl ?? "");
        if (raw) uniquePush(target, resolveUrl(raw, pageUrl));
      }
    }
  }
  for (const child of Object.values(obj)) if (child && typeof child === "object") collectJsonLdImages(child, target, pageUrl);
}

async function inspectProductPage(pageUrl: string): Promise<{ candidates: RawCandidate[]; error?: string }> {
  try {
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return { candidates: [], error: `Página HTTP ${response.status}` };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return { candidates: [], error: "Resultado não é HTML" };
    const html = (await response.text()).slice(0, 600_000);
    if (looksNSFW(`${pageUrl} ${html.slice(0, 20000)}`)) return { candidates: [], error: "Página bloqueada pelo filtro de segurança" };

    const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
    let description = "";
    const imageUrls: string[] = [];
    const metaRegex = /<meta\s+[^>]*>/gi;
    let meta: RegExpExecArray | null;
    while ((meta = metaRegex.exec(html))) {
      const tag = meta[0];
      const property = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase();
      const content = attr(tag, "content");
      if (!content) continue;
      if (["og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"].includes(property)) uniquePush(imageUrls, resolveUrl(content, pageUrl));
      if (!description && ["description", "og:description"].includes(property)) description = stripTags(content).slice(0, 1000);
    }

    const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ld: RegExpExecArray | null;
    while ((ld = ldRegex.exec(html))) {
      try { collectJsonLdImages(JSON.parse(decodeHtml(ld[1])), imageUrls, pageUrl); } catch { /* JSON-LD inválido */ }
    }

    const bodyContext = stripTags(html).slice(0, 6000);
    const context = `${pageUrl} ${title} ${description} ${bodyContext}`;
    const candidates = imageUrls
      .filter((url) => !looksGenericImage(url) && !hasBadDomain(url))
      .slice(0, 6)
      .map((url) => ({ url, title, desc: context, source: `page:${new URL(pageUrl).hostname}` }));
    return { candidates, error: candidates.length ? undefined : "Página sem imagem de produto estruturada" };
  } catch (error) {
    return { candidates: [], error: error instanceof Error ? error.message : "Falha ao abrir página" };
  }
}

async function searchBingImagesFallback(query: string): Promise<RawCandidate[]> {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&safeSearch=Strict&adlt=strict`;
    const response = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return [];
    const html = await response.text();
    const out: RawCandidate[] = [];
    const regex = /\bm=["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) && out.length < 8) {
      try {
        const data = JSON.parse(decodeHtml(match[1]));
        const imageUrl = String(data.murl ?? data.mediaUrl ?? "");
        if (!imageUrl || hasBadDomain(imageUrl) || looksNSFW(`${imageUrl} ${data.t ?? ""}`)) continue;
        out.push({ url: imageUrl, title: String(data.t ?? ""), desc: String(data.desc ?? ""), source: "bing-images-fallback" });
      } catch { /* ignora */ }
    }
    return out;
  } catch { return []; }
}

async function downloadImage(url: string): Promise<{ image?: DownloadedImage; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "Referer": new URL(url).origin },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return { error: `Download HTTP ${response.status}` };
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return { error: `Conteúdo não é imagem (${contentType || "sem tipo"})` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1500) return { error: "Imagem muito pequena" };
    if (bytes.byteLength > 8_000_000) return { error: "Imagem maior que 8 MB" };
    return { image: { bytes, contentType } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha no download" };
  }
}

async function findDownloadableImage(product: ProductForImage, excluded: Set<string> = new Set()): Promise<{
  image?: DownloadedImage;
  sourceUrl?: string;
  diagnostics: string[];
}> {
  const diagnostics: string[] = [];
  const candidates: ImageCandidate[] = [];
  const pageUrls: string[] = [];
  const queries = buildQueries(product);

  for (const query of queries.slice(0, 2)) {
    const ddg = await searchDuckDuckGo(query);
    if (ddg.error) diagnostics.push(`DDG: ${ddg.error}`);
    ddg.urls.forEach((url) => uniquePush(pageUrls, url));
    if (pageUrls.length >= 4) break;

    const bing = await searchBingWeb(query);
    if (bing.error) diagnostics.push(`Bing Web: ${bing.error}`);
    bing.urls.forEach((url) => uniquePush(pageUrls, url));
    if (pageUrls.length >= MAX_PAGE_URLS) break;
  }

  pageUrls.sort((a, b) => Number(hasPreferredDomain(b)) - Number(hasPreferredDomain(a)));
  for (const pageUrl of pageUrls.slice(0, MAX_PAGES_TO_INSPECT)) {
    const page = await inspectProductPage(pageUrl);
    if (page.error) diagnostics.push(`${new URL(pageUrl).hostname}: ${page.error}`);
    for (const raw of page.candidates) {
      if (excluded.has(raw.url)) continue;
      const score = scoreCandidate(product, raw);
      if (score > 0 && !candidates.some((item) => item.url === raw.url)) candidates.push({ ...raw, score });
    }
  }

  const models = modelTokens(product);
  const minimumScore = models.length ? 7 : 5;
  candidates.sort((a, b) => b.score - a.score);

  // Fallback final: Bing Images, somente se nenhuma página real produziu candidato confiável.
  if (!candidates.some((candidate) => candidate.score >= minimumScore) && queries[0]) {
    diagnostics.push("Busca web sem candidato suficiente; usando Bing Images como fallback final");
    const fallback = await searchBingImagesFallback(queries[0]);
    for (const raw of fallback) {
      if (excluded.has(raw.url)) continue;
      const score = scoreCandidate(product, raw);
      if (score > 0) candidates.push({ ...raw, score });
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  const acceptable = candidates.filter((candidate) => candidate.score >= minimumScore).slice(0, 6);
  if (!acceptable.length) {
    diagnostics.push(`Nenhum candidato atingiu a pontuação mínima ${minimumScore}`);
    return { diagnostics };
  }

  for (const candidate of acceptable) {
    const download = await downloadImage(candidate.url);
    if (download.image) {
      diagnostics.unshift(`Fonte usada: ${candidate.source}; score ${candidate.score.toFixed(1)}`);
      return { image: download.image, sourceUrl: candidate.url, diagnostics };
    }
    diagnostics.push(`${candidate.source}: ${download.error ?? "download recusado"}`);
  }

  diagnostics.push("Candidatos encontrados, mas nenhum pôde ser baixado");
  return { diagnostics };
}

function extensionFromContentType(contentType: string): string {
  const subtype = contentType.split("/")[1] ?? "jpeg";
  const normalized = subtype.split("+")[0].split(";")[0].toLowerCase();
  if (normalized === "jpeg") return "jpg";
  if (["png", "webp", "gif", "avif"].includes(normalized)) return normalized;
  return "jpg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRow } = await authClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body: ReqBody = await req.json().catch(() => ({}));
    const db = createClient(supabaseUrl, supabaseServiceKey);
    const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_PRODUCTS_PER_REQUEST);
    const isManual = Boolean(body.product_ids?.length);

    const columns = "id, name, code, brand, image_url, image_review_status, image_rejected_sources";
    let query = db.from("products").select(columns);
    if (isManual) query = query.in("id", body.product_ids!);
    else query = query.or("image_url.is.null,image_url.eq.");

    const { data: products, error: productsError } = await query.limit(limit);
    if (productsError) throw productsError;

    const { count: remainingCount } = isManual
      ? { count: null as number | null }
      : await db.from("products").select("id", { count: "exact", head: true }).or("image_url.is.null,image_url.eq.");

    if (!products?.length) {
      return new Response(JSON.stringify({ ok: true, updated: 0, total: 0, processed: 0, found: 0, notFound: 0, remaining: remainingCount ?? 0, errors: [], message: "Nada para buscar" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let updated = 0;
    let processed = 0;
    let skipped = 0;
    const errors: { id: string; product: string; error: string; diagnostics?: string[] }[] = [];

    for (const product of products as ProductForImage[]) {
      try {
        const hasImage = Boolean(clean(product.image_url));
        const isApproved = (product.image_review_status ?? "approved") === "approved";
        if (hasImage && isApproved && !(isManual && body.overwrite)) { skipped += 1; continue; }
        if (hasImage && !isManual) { skipped += 1; continue; }

        processed += 1;
        const excluded = new Set((product.image_rejected_sources ?? []).filter(Boolean));
        const result = await findDownloadableImage(product, excluded);
        if (!result.image || !result.sourceUrl) {
          errors.push({ id: product.id, product: product.name, error: "Nenhuma imagem válida encontrada", diagnostics: result.diagnostics.slice(0, 8) });
          continue;
        }

        const extension = extensionFromContentType(result.image.contentType);
        const path = `auto/${product.id}.${extension}`;
        const { error: uploadError } = await db.storage.from("product-images").upload(path, result.image.bytes, { contentType: result.image.contentType, upsert: true, cacheControl: "31536000" });
        if (uploadError) { errors.push({ id: product.id, product: product.name, error: `Falha ao salvar imagem: ${uploadError.message}` }); continue; }

        const { data: publicData } = db.storage.from("product-images").getPublicUrl(path);
        let imageUrl = publicData.publicUrl;
        if (!imageUrl) {
          const { data: signed, error: signedError } = await db.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
          if (signedError) { errors.push({ id: product.id, product: product.name, error: `Falha ao gerar URL: ${signedError.message}` }); continue; }
          imageUrl = signed.signedUrl;
        }

        const displayUrl = `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
        const { error: updateError } = await db.from("products").update({
          image_url: displayUrl,
          image_source_url: result.sourceUrl,
          image_review_status: "suspect",
          image_review_note: result.diagnostics[0] ?? "Imagem encontrada automaticamente — aprove antes de publicar",
        }).eq("id", product.id);
        if (updateError) { errors.push({ id: product.id, product: product.name, error: `Falha ao atualizar produto: ${updateError.message}` }); continue; }

        updated += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (error) {
        errors.push({ id: product.id, product: product.name, error: error instanceof Error ? error.message : "Erro desconhecido" });
      }
    }

    return new Response(JSON.stringify({
      ok: true, updated, found: updated, notFound: errors.length, processed, skipped, total: products.length,
      failed: errors.length, remaining: Math.max((remainingCount ?? 0) - updated, 0), errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});