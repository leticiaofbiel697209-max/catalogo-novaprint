import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, ShieldOff, Check, X, Mail } from "lucide-react";

interface AdminRow { user_id: string; email: string; created_at?: string; last_sign_in_at?: string | null; }
interface RequestRow { id: string; email: string; name: string; phone: string | null; message: string | null; status: string; created_at: string; }

export default function AdminUsers() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);

  // Create admin dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [nEmail, setNEmail] = useState(""); const [nPass, setNPass] = useState("");
  const [busy, setBusy] = useState(false);

  // Approve dialog
  const [approveReq, setApproveReq] = useState<RequestRow | null>(null);
  const [approvePass, setApprovePass] = useState("");

  const call = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke("manage-admins", { body: payload });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
      const [adminsResp, reqResp] = await Promise.all([
        call({ action: "list_admins" }),
        supabase.from("admin_access_requests").select("*").order("created_at", { ascending: false }),
      ]);
      setAdmins((adminsResp as any).admins ?? []);
      setRequests((reqResp.data as any) ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createAdmin = async () => {
    setBusy(true);
    try {
      await call({ action: "create_admin", email: nEmail, password: nPass });
      toast.success("Administrador criado");
      setCreateOpen(false); setNEmail(""); setNPass("");
      load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm("Remover privilégios de administrador?")) return;
    try { await call({ action: "revoke_admin", user_id: id }); toast.success("Removido"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Excluir usuário permanentemente? Esta ação é irreversível.")) return;
    try { await call({ action: "delete_user", user_id: id }); toast.success("Usuário excluído"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const approve = async () => {
    if (!approveReq) return;
    setBusy(true);
    try {
      await call({ action: "approve_request", id: approveReq.id, password: approvePass });
      toast.success(`${approveReq.email} promovido a admin`);
      setApproveReq(null); setApprovePass("");
      load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const reject = async (id: string) => {
    if (!confirm("Rejeitar esta solicitação?")) return;
    try { await call({ action: "reject_request", id }); toast.success("Rejeitada"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Administradores</h1>
          <p className="text-muted-foreground">Gerencie contas com acesso ao painel</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Novo administrador
        </Button>
      </div>

      <Tabs defaultValue="admins">
        <TabsList>
          <TabsTrigger value="admins">Administradores ({admins.length})</TabsTrigger>
          <TabsTrigger value="requests">
            Solicitações {pendingCount > 0 && <Badge variant="destructive" className="ml-2">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="admins">
          <Card><CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
            ) : admins.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum administrador.</div>
            ) : (
              <div className="divide-y">
                {admins.map((a) => (
                  <div key={a.user_id} className="p-4 flex items-center gap-3 flex-wrap">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{a.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Último acesso: {a.last_sign_in_at ? new Date(a.last_sign_in_at).toLocaleString("pt-BR") : "—"}
                      </div>
                    </div>
                    {a.user_id === me && <Badge variant="secondary">Você</Badge>}
                    <Button variant="outline" size="sm" disabled={a.user_id === me} onClick={() => revoke(a.user_id)}>
                      <ShieldOff className="h-4 w-4 mr-1" /> Revogar
                    </Button>
                    <Button variant="destructive" size="sm" disabled={a.user_id === me} onClick={() => deleteUser(a.user_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card><CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
            ) : requests.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma solicitação.</div>
            ) : (
              <div className="divide-y">
                {requests.map((r) => (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-sm text-muted-foreground">&lt;{r.email}&gt;</span>
                      <Badge variant={r.status === "pending" ? "default" : r.status === "approved" ? "secondary" : "destructive"}>
                        {r.status === "pending" ? "pendente" : r.status === "approved" ? "aprovada" : "rejeitada"}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    {r.phone && <div className="text-sm text-muted-foreground">Tel: {r.phone}</div>}
                    {r.message && <div className="text-sm">{r.message}</div>}
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { setApproveReq(r); setApprovePass(""); }}>
                          <Check className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => reject(r.id)}>
                          <X className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar administrador</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>E-mail</Label><Input type="email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} /></div>
            <div><Label>Senha (mín. 8 caracteres)</Label><Input type="password" value={nPass} onChange={(e) => setNPass(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Compartilhe a senha em canal seguro. O novo admin pode alterá-la depois.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createAdmin} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveReq} onOpenChange={(o) => !o && setApproveReq(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprovar solicitação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Será criada uma conta de admin para <strong>{approveReq?.email}</strong>.</p>
            <div><Label>Defina uma senha inicial (mín. 8)</Label><Input type="password" value={approvePass} onChange={(e) => setApprovePass(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveReq(null)}>Cancelar</Button>
            <Button onClick={approve} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Aprovar e criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
