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
}

interface DownloadedImage {
  bytes: Uint8Array;
  contentType: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_RESULTS_PER_QUERY = 30;
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
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
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

function hasProductContext(text: string): boolean {
  return /toner|cartucho|cilindro|fotocondutor|drum|refil|tinta|impressora|multifuncional|papel|etiqueta|bobina|suprimento|papelaria|office|printer|ink|cartridge|mouse|teclado|monitor|notebook|memoria|memória|ssd|hd|cabo|adaptador|headset|webcam|roteador|informatica|informática|limpeza|detergente|desinfetante|alcool|álcool|saco|lixeira|esponja|vassoura|rodo|caneta|lapis|lápis|grampeador|grampo|pasta|arquivo|caderno|envelope|garrafa|termica|térmica|copo|crachá|cracha/.test(text);
}

function productTokens(product: ProductForImage): string[] {
  const raw = [product.brand, product.code, product.name].filter(Boolean).join(" ");
  return normalizeText(raw)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token))
    .slice(0, 16);
}

function modelTokens(product: ProductForImage): string[] {
  const raw = [product.code, product.name].filter(Boolean).join(" ");
  return normalizeText(raw)
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
  const queries = [
    code && brand ? `"${brand}" "${code}"` : "",
    code ? `"${code}" ${brand} produto` : "",
    brand ? `${brand} ${compactName}` : compactName,
    `${compactName} foto produto`,
    `${compactName} imagem fundo branco`,
  ];

  return queries
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query, index, all) => query && all.indexOf(query) === index && !looksNSFW(query));
}

function scoreCandidate(product: ProductForImage, candidate: RawCandidate): number {
  const haystack = normalizeText(`${candidate.title} ${candidate.desc} ${candidate.url}`);
  const compactHaystack = haystack.replace(/\s+/g, "");
  const tokens = productTokens(product);
  const models = modelTokens(product);
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  const matchedModels = models.filter((token) => compactHaystack.includes(token.replace(/\s+/g, "")));
  const code = normalizeText(product.code ?? "").replace(/\s+/g, "");
  const brand = normalizeText(product.brand ?? "");

  let score = matchedTokens.length * 1.25;
  if (code && code.length >= 3 && compactHaystack.includes(code)) score += 9;
  if (brand && brand.length >= 3 && haystack.includes(brand)) score += 3;
  score += matchedModels.length * 4;
  if (hasProductContext(haystack)) score += 1.5;
  if (hasPreferredDomain(candidate.url)) score += 2;
  if (candidate.source === "bing-json") score += 0.5;
  if (hasBadDomain(candidate.url)) score -= 8;
  if (looksNSFW(haystack)) score -= 100;

  const hasStrongIdentifier =
    Boolean(code && code.length >= 3 && compactHaystack.includes(code)) || matchedModels.length > 0;

  if (!hasStrongIdentifier && matchedTokens.length < 2) score -= 2;
  if (brand && !haystack.includes(brand) && !hasStrongIdentifier) score -= 2;

  return score;
}

function addCandidate(target: RawCandidate[], candidate: RawCandidate): void {
  const url = clean(candidate.url);
  if (!/^https?:\/\//i.test(url)) return;
  if (url.startsWith("data:")) return;
  if (hasBadDomain(url) || looksNSFW(`${candidate.title} ${candidate.desc} ${url}`)) return;
  if (target.some((item) => item.url === url)) return;
  target.push({ ...candidate, url });
}

function parseBingHtml(html: string): RawCandidate[] {
  const candidates: RawCandidate[] = [];

  const metadataRegex = /\bm=["']([^"']+)["']/g;
  let metadataMatch: RegExpExecArray | null;
  while ((metadataMatch = metadataRegex.exec(html)) !== null && candidates.length < MAX_RESULTS_PER_QUERY) {
    try {
      const decoded = decodeHtml(metadataMatch[1]);
      const data = JSON.parse(decoded);
      addCandidate(candidates, {
        url: String(data.murl ?? data.mediaUrl ?? ""),
        title: String(data.t ?? data.title ?? ""),
        desc: String(data.desc ?? data.description ?? ""),
        source: "bing-json",
      });
    } catch {
      // Ignora blocos que não sejam JSON válido.
    }
  }

  const jsonUrlRegex = /["'](?:murl|mediaUrl)["']\s*:\s*["']([^"']+)["']/gi;
  let jsonUrlMatch: RegExpExecArray | null;
  while ((jsonUrlMatch = jsonUrlRegex.exec(html)) !== null && candidates.length < MAX_RESULTS_PER_QUERY) {
    addCandidate(candidates, {
      url: decodeHtml(jsonUrlMatch[1]),
      title: "",
      desc: "",
      source: "bing-fallback-json",
    });
  }

  const imageUrlRegex = /(?:mediaurl|imgurl|imageurl)=([^&"'\s]+)/gi;
  let imageUrlMatch: RegExpExecArray | null;
  while ((imageUrlMatch = imageUrlRegex.exec(html)) !== null && candidates.length < MAX_RESULTS_PER_QUERY) {
    try {
      addCandidate(candidates, {
        url: decodeURIComponent(decodeHtml(imageUrlMatch[1])),
        title: "",
        desc: "",
        source: "bing-querystring",
      });
    } catch {
      // Ignora URL malformada.
    }
  }

  return candidates;
}

async function searchBing(query: string): Promise<{ candidates: RawCandidate[]; error?: string }> {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&safeSearch=Strict&adlt=strict`;
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

    if (!response.ok) {
      return { candidates: [], error: `Bing HTTP ${response.status}` };
    }

    const html = await response.text();
    if (/captcha|unusual traffic|verify you are human/i.test(html)) {
      return { candidates: [], error: "Bing bloqueou temporariamente a consulta" };
    }

    const candidates = parseBingHtml(html);
    return {
      candidates,
      error: candidates.length === 0 ? "Bing não retornou URLs de imagem reconhecíveis" : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar Bing";
    return { candidates: [], error: message };
  }
}

async function downloadImage(url: string): Promise<{ image?: DownloadedImage; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": new URL(url).origin,
      },
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

async function findDownloadableImage(product: ProductForImage): Promise<{
  image?: DownloadedImage;
  sourceUrl?: string;
  diagnostics: string[];
}> {
  const diagnostics: string[] = [];
  const candidates: ImageCandidate[] = [];

  for (const query of buildQueries(product)) {
    const result = await searchBing(query);
    if (result.error) diagnostics.push(`${query}: ${result.error}`);

    for (const raw of result.candidates) {
      const score = scoreCandidate(product, raw);
      if (score > 0 && !candidates.some((candidate) => candidate.url === raw.url)) {
        candidates.push({ ...raw, score });
      }
    }

    if (candidates.some((candidate) => candidate.score >= 9)) break;
  }

  candidates.sort((a, b) => b.score - a.score);
  const models = modelTokens(product);
  const minimumScore = models.length > 0 ? 5 : 3.5;
  const acceptable = candidates.filter((candidate) => candidate.score >= minimumScore).slice(0, 8);

  if (acceptable.length === 0) {
    diagnostics.push(`Nenhum candidato atingiu a pontuação mínima ${minimumScore}`);
    return { diagnostics };
  }

  for (const candidate of acceptable) {
    const download = await downloadImage(candidate.url);
    if (download.image) {
      return { image: download.image, sourceUrl: candidate.url, diagnostics };
    }
    diagnostics.push(`${candidate.url.slice(0, 100)}: ${download.error ?? "download recusado"}`);
  }

  diagnostics.push("Todos os candidatos encontrados recusaram o download");
  return { diagnostics };
}

function extensionFromContentType(contentType: string): string {
  const subtype = contentType.split("/")[1] ?? "jpeg";
  const normalized = subtype.split("+")[0].split(";")[0].toLowerCase();
  if (normalized === "jpeg") return "jpg";
  if (["png", "webp", "gif", "svg+xml", "avif"].includes(normalized)) {
    return normalized === "svg+xml" ? "svg" : normalized;
  }
  return "jpg";
}

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
    const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), 100);

    let query = db.from("products").select("id, name, code, brand, image_url");
    if (body.product_ids?.length) {
      query = query.in("id", body.product_ids);
    } else if (!body.overwrite) {
      query = query.or("image_url.is.null,image_url.eq.");
    }

    const { data: products, error: productsError } = await query.limit(limit);
    if (productsError) throw productsError;

    if (!products?.length) {
      return new Response(JSON.stringify({ ok: true, updated: 0, total: 0, errors: [], message: "Nada para buscar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const errors: { id: string; product: string; error: string; diagnostics?: string[] }[] = [];

    for (const product of products as ProductForImage[]) {
      try {
        if (!body.overwrite && clean(product.image_url)) continue;

        const result = await findDownloadableImage(product);
        if (!result.image || !result.sourceUrl) {
          errors.push({
            id: product.id,
            product: product.name,
            error: "Nenhuma imagem válida encontrada",
            diagnostics: result.diagnostics.slice(0, 6),
          });
          continue;
        }

        const extension = extensionFromContentType(result.image.contentType);
        const path = `auto/${product.id}.${extension}`;
        const { error: uploadError } = await db.storage.from("product-images").upload(path, result.image.bytes, {
          contentType: result.image.contentType,
          upsert: true,
          cacheControl: "31536000",
        });
        if (uploadError) {
          errors.push({ id: product.id, product: product.name, error: `Falha ao salvar imagem: ${uploadError.message}` });
          continue;
        }

        const { data: publicData } = db.storage.from("product-images").getPublicUrl(path);
        let imageUrl = publicData.publicUrl;

        if (!imageUrl) {
          const { data: signed, error: signedError } = await db.storage
            .from("product-images")
            .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
          if (signedError) {
            errors.push({ id: product.id, product: product.name, error: `Falha ao gerar URL: ${signedError.message}` });
            continue;
          }
          imageUrl = signed.signedUrl;
        }

        const { error: updateError } = await db
          .from("products")
          .update({
            image_url: imageUrl,
            image_source_url: result.sourceUrl,
            image_review_status: "suspect",
            image_review_note: "Imagem encontrada automaticamente — aprove antes de considerar definitiva",
          })
          .eq("id", product.id);

        if (updateError) {
          errors.push({ id: product.id, product: product.name, error: `Falha ao atualizar produto: ${updateError.message}` });
          continue;
        }

        updated += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        errors.push({
          id: product.id,
          product: product.name,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      updated,
      total: products.length,
      failed: errors.length,
      errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
