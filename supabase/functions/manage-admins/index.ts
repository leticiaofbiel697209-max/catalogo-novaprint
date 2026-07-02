// Admin user management (list admins, create, promote, revoke, delete, approve requests)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return json({ error: "Não autenticado" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
  const callerId = userData.user.id;

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Acesso negado" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const action = body?.action as string;

  try {
    if (action === "list_admins") {
      const { data: roles } = await admin.from("user_roles").select("user_id, created_at").eq("role", "admin");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 200 });
      const map = new Map(usersList.users.map((u) => [u.id, u]));
      const admins = ids.map((id) => {
        const u = map.get(id);
        return {
          user_id: id,
          email: u?.email ?? "—",
          created_at: u?.created_at,
          last_sign_in_at: u?.last_sign_in_at,
        };
      });
      return json({ admins });
    }

    if (action === "create_admin") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!email || password.length < 8) return json({ error: "E-mail e senha (mín 8) obrigatórios" }, 400);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (cErr || !created.user) return json({ error: cErr?.message ?? "Falha ao criar usuário" }, 400);
      const { error: rErr } = await admin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
      if (rErr) return json({ error: rErr.message }, 400);
      return json({ ok: true, user_id: created.user.id });
    }

    if (action === "revoke_admin") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id obrigatório" }, 400);
      if (targetId === callerId) return json({ error: "Você não pode remover a si mesmo" }, 400);
      const { error } = await admin.from("user_roles").delete().eq("user_id", targetId).eq("role", "admin");
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete_user") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id obrigatório" }, 400);
      if (targetId === callerId) return json({ error: "Você não pode excluir a si mesmo" }, 400);
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "approve_request") {
      const id = String(body.id ?? "");
      const password = String(body.password ?? "");
      if (!id || password.length < 8) return json({ error: "id e senha (mín 8) obrigatórios" }, 400);
      const { data: reqRow, error: rqErr } = await admin
        .from("admin_access_requests").select("*").eq("id", id).maybeSingle();
      if (rqErr || !reqRow) return json({ error: "Solicitação não encontrada" }, 404);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: reqRow.email, password, email_confirm: true,
      });
      if (cErr || !created.user) return json({ error: cErr?.message ?? "Falha ao criar usuário" }, 400);
      await admin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
      await admin.from("admin_access_requests").update({
        status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: callerId,
      }).eq("id", id);
      return json({ ok: true, user_id: created.user.id });
    }

    if (action === "reject_request") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id obrigatório" }, 400);
      const { error } = await admin.from("admin_access_requests").update({
        status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: callerId,
      }).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e: any) {
    console.error("manage-admins error", e);
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
});
