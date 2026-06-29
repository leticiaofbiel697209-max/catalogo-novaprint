// Edge Function: fetch-product-images
// Busca uma imagem na web (Bing Images) por produto, baixa, faz upload e
// atualiza products.image_url. Em massa ou por ids.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ReqBody {
  product_ids?: string[];
  overwrite?: boolean;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function searchImage(query: string): Promise<string | null> {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" } });
  if (!r.ok) return null;
  const html = await r.text();
  // procura padrões "murl":"https://..."
  const regex = /"murl":"(https?:[^"\\]+(?:\\.[^"\\]*)*)"/g;
  let m: RegExpExecArray | null;
  const candidates: string[] = [];
  while ((m = regex.exec(html)) !== null) {
    const u = m[1].replace(/\\\//g, "/").replace(/\\u002f/g, "/");
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)) candidates.push(u);
    if (candidates.length >= 8) break;
  }
  return candidates[0] ?? null;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 2000 || buf.byteLength > 6_000_000) return null;
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
    const { data: products, error } = await q.limit(200);
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
        const query = [p.brand, p.code, p.name].filter(Boolean).join(" ");
        const imgUrl = await searchImage(query);
        if (!imgUrl) { errors.push({ id: p.id, error: "Nenhuma imagem encontrada" }); continue; }
        const dl = await downloadImage(imgUrl);
        if (!dl) { errors.push({ id: p.id, error: "Download falhou" }); continue; }

        const ext = dl.contentType.split("/")[1]?.split(";")[0] ?? "jpg";
        const path = `auto/${p.id}.${ext === "jpeg" ? "jpg" : ext}`;
        const { error: upErr } = await db.storage.from("product-images").upload(path, dl.bytes, {
          contentType: dl.contentType, upsert: true,
        });
        if (upErr) { errors.push({ id: p.id, error: upErr.message }); continue; }

        const { data: signed, error: sErr } = await db.storage
          .from("product-images")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (sErr) { errors.push({ id: p.id, error: sErr.message }); continue; }

        const { error: updErr } = await db.from("products").update({ image_url: signed.signedUrl }).eq("id", p.id);
        if (updErr) { errors.push({ id: p.id, error: updErr.message }); continue; }
        updated++;
        // pequeno respiro pra não martelar o Bing
        await new Promise((r) => setTimeout(r, 250));
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
