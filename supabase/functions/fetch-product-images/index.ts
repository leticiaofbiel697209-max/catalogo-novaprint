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
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Blocklist para filtrar resultados NSFW / pornográficos
const NSFW_KEYWORDS = [
  "porn", "porno", "xxx", "sex", "sexo", "nude", "nudes", "naked", "erotic", "erotico", "erótico",
  "adult", "adulto", "hentai", "xvideos", "xnxx", "xhamster", "redtube", "pornhub", "youporn",
  "onlyfans", "camgirl", "escort", "acompanhante", "boobs", "peito", "bunda", "pussy", "dick",
  "penis", "vagina", "anal", "fetish", "fetiche", "bdsm", "milf", "teen sex", "cumshot",
];

const BAD_IMAGE_DOMAINS = [
  "facebook.com", "instagram.com", "pinterest.", "tiktok.com", "youtube.com", "x.com", "twitter.com",
  "blogspot.", "wordpress.", "tumblr.", "reddit.com", "wikipedia.org", "wikimedia.org", "shutterstock.com",
  "istockphoto.com", "alamy.com", "gettyimages", "dreamstime.com", "depositphotos.com",
];

const GENERIC_WORDS = new Set([
  "produto", "produtos", "compativel", "compatível", "original", "promo", "promocao", "promoção",
  "preto", "black", "branco", "colorido", "magenta", "cyan", "ciano", "yellow", "amarelo", "unidade",
  "novo", "nova", "para", "com", "sem", "kit", "cx", "caixa", "und", "un", "ml", "kg", "a4", "oficio",
]);

interface ProductForImage {
  id: string;
  name: string;
  code: string | null;
  brand: string | null;
  image_url: string | null;
}

interface ImageCandidate {
  url: string;
  title: string;
  desc: string;
  score: number;
}

function looksNSFW(text: string): boolean {
  const t = text.toLowerCase();
  return NSFW_KEYWORDS.some((k) => t.includes(k));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productTokens(p: ProductForImage): string[] {
  const raw = [p.brand, p.code, p.name].filter(Boolean).join(" ");
  return normalizeText(raw)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token))
    .slice(0, 12);
}

function hasBadDomain(url: string): boolean {
  const u = url.toLowerCase();
  return BAD_IMAGE_DOMAINS.some((domain) => u.includes(domain));
}

function scoreCandidate(p: ProductForImage, candidate: Omit<ImageCandidate, "score">): number {
  const haystack = normalizeText(`${candidate.title} ${candidate.desc} ${candidate.url}`);
  const tokens = productTokens(p);
  if (tokens.length === 0) return 0;

  const code = normalizeText(p.code ?? "").replace(/\s+/g, "");
  const brand = normalizeText(p.brand ?? "");
  const matched = tokens.filter((token) => haystack.includes(token));

  let score = matched.length * 2;
  if (code && code.length >= 4 && haystack.replace(/\s+/g, "").includes(code)) score += 8;
  if (brand && brand.length >= 3 && haystack.includes(brand)) score += 4;
  if (/produto|comprar|loja|papelaria|toner|cartucho|impressora|scanner|papel|refil|suprimento|informatica|informática/.test(haystack)) score += 2;
  if (hasBadDomain(candidate.url)) score -= 8;
  if (looksNSFW(haystack)) score -= 100;

  const minMatches = code ? 1 : Math.min(3, Math.max(2, Math.ceil(tokens.length / 4)));
  if (matched.length < minMatches && !(code && score >= 8)) return 0;
  return score;
}

function buildQueries(p: ProductForImage): string[] {
  const name = [p.brand, p.code, p.name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const codeFirst = [p.brand, p.code, "produto"].filter(Boolean).join(" ");
  const quotedCode = p.code ? `"${p.code}" ${p.brand ?? ""} produto` : "";
  return [quotedCode, `${name} produto`, codeFirst, `${p.name} ${p.brand ?? ""} loja`]
    .map((q) => q.trim())
    .filter((q, i, arr) => q && arr.indexOf(q) === i && !looksNSFW(q));
}

async function searchImage(product: ProductForImage): Promise<string | null> {
  const queries = buildQueries(product);
  // Se a própria consulta contém termo suspeito, aborta
  if (queries.length === 0) return null;
  // adlt=strict força SafeSearch estrito no Bing; cookie reforça a preferência
  const candidates: ImageCandidate[] = [];

  for (const query of queries) {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&safeSearch=Strict&adlt=strict&cw=1177&ch=760`;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Cookie": "SRCHHPGUSR=ADLT=STRICT&ADLT_SET=1",
        },
      });
      if (!r.ok) continue;
      const html = await r.text();
      const reM = /m="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = reM.exec(html)) !== null) {
        try {
          const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          const obj = JSON.parse(decoded);
          const item = {
            url: String(obj.murl ?? ""),
            title: String(obj.t ?? ""),
            desc: String(obj.desc ?? ""),
          };
          if (!/^https?:\/\//i.test(item.url)) continue;
          if (!/\.(jpe?g|png|webp)(\?|$)/i.test(item.url)) continue;
          if (looksNSFW(`${item.title} ${item.desc} ${item.url}`) || hasBadDomain(item.url)) continue;
          const score = scoreCandidate(product, item);
          if (score >= 6 && !candidates.some((c) => c.url === item.url)) candidates.push({ ...item, score });
        } catch { /* ignore */ }
        if (candidates.length >= 12) break;
      }
    } catch {
      continue;
    }
    if (candidates.some((c) => c.score >= 12)) break;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? null;
}

function shouldReplaceExistingImage(url: string | null, overwrite?: boolean): boolean {
  if (!url) return true;
  return overwrite === true;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 1000 || buf.byteLength > 6_000_000) return null;
    return { bytes: buf, contentType: ct };
  } catch {
    return null;
  }
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

    let q = db.from("products").select("id, name, code, brand, image_url");
    if (body.product_ids && body.product_ids.length > 0) {
      q = q.in("id", body.product_ids);
    } else if (!body.overwrite) {
      q = q.is("image_url", null);
    }
    const { data: products, error } = await q.limit(50);
    if (error) throw error;
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0, message: "Nada para buscar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const errors: { id: string; error: string }[] = [];

    for (const p of products) {
      try {
        if (!shouldReplaceExistingImage(p.image_url, body.overwrite)) continue;
        const imgUrl = await searchImage(p as ProductForImage);
        if (!imgUrl) { errors.push({ id: p.id, error: "Nenhuma imagem encontrada" }); continue; }
        const dl = await downloadImage(imgUrl);
        if (!dl) { errors.push({ id: p.id, error: "Download falhou" }); continue; }

        const extRaw = (dl.contentType.split("/")[1] ?? "jpg").split(";")[0];
        const ext = extRaw === "jpeg" ? "jpg" : extRaw;
        const path = `auto/${p.id}.${ext}`;
        const { error: upErr } = await db.storage.from("product-images").upload(path, dl.bytes, {
          contentType: dl.contentType, upsert: true,
        });
        if (upErr) { errors.push({ id: p.id, error: upErr.message }); continue; }

        const { data: signed, error: sErr } = await db.storage
          .from("product-images")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (sErr) { errors.push({ id: p.id, error: sErr.message }); continue; }

        const { error: updErr } = await db.from("products").update({
          image_url: signed.signedUrl,
          image_source_url: imgUrl,
          image_review_status: "suspect",
          image_review_note: "Imagem encontrada automaticamente — aprove antes de considerar definitiva",
        }).eq("id", p.id);
        if (updErr) { errors.push({ id: p.id, error: updErr.message }); continue; }
        updated++;
        await new Promise((r) => setTimeout(r, 400));
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
