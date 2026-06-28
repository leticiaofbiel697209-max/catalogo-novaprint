import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, statusColor, statusLabel } from "@/lib/format";
import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminOrders() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, customers(*)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["admin-order", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, customers(*), order_items(*)").eq("id", selected!).maybeSingle();
      return data;
    },
  });

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("orders").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    qc.invalidateQueries({ queryKey: ["admin-order", id] });
    toast.success("Status atualizado");
  };

  const sendToGestao = async (id: string) => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-order-to-gestaoclick", {
        body: { order_id: id },
      });
      if (error) throw error;
      if (data?.success) toast.success("Enviado ao GestãoClick (mock)");
      else toast.error(data?.error ?? "Falha no envio");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order", id] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-muted-foreground text-sm">Solicitações recebidas dos clientes</p>
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {orders?.map((o: any) => (
            <button key={o.id} onClick={() => setSelected(o.id)} className="w-full flex items-center gap-4 p-4 text-left hover:bg-accent/50">
              <div className="flex-1 min-w-0">
                <div className="font-medium">#{o.order_number} — {o.customers?.company ?? o.customers?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {o.customers?.name} • {new Date(o.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-primary">{formatBRL(o.total_value)}</div>
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 ${statusColor[o.status] ?? ""}`}>{statusLabel[o.status] ?? o.status}</span>
            </button>
          ))}
          {(!orders || orders.length === 0) && <div className="p-8 text-center text-muted-foreground">Nenhum pedido ainda.</div>}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Pedido #{detail?.order_number}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <Card><CardContent className="p-4 grid sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> {detail.customers?.name}</div>
                <div><span className="text-muted-foreground">Empresa:</span> {detail.customers?.company}</div>
                <div><span className="text-muted-foreground">CNPJ:</span> {detail.customers?.cnpj ?? "—"}</div>
                <div><span className="text-muted-foreground">Telefone:</span> {detail.customers?.phone ?? "—"}</div>
                <div><span className="text-muted-foreground">E-mail:</span> {detail.customers?.email ?? "—"}</div>
                <div><span className="text-muted-foreground">Criado em:</span> {new Date(detail.created_at).toLocaleString("pt-BR")}</div>
                {detail.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Observações:</span> {detail.notes}</div>}
                {detail.gestaoclick_id && <div className="sm:col-span-2"><span className="text-muted-foreground">GestãoClick ID:</span> <span className="font-mono">{detail.gestaoclick_id}</span></div>}
              </CardContent></Card>

              <Card><CardContent className="p-0 divide-y">
                {detail.order_items?.map((i: any) => (
                  <div key={i.id} className="p-3 flex justify-between text-sm">
                    <div>
                      <div className="font-medium">{i.product_name}</div>
                      <div className="text-xs text-muted-foreground">{i.product_code} • {i.quantity} × {formatBRL(i.unit_price)}</div>
                    </div>
                    <div className="font-semibold">{formatBRL(i.total_price)}</div>
                  </div>
                ))}
                <div className="p-3 flex justify-between font-bold bg-secondary/40">
                  <span>Total</span><span className="text-primary">{formatBRL(detail.total_value)}</span>
                </div>
              </CardContent></Card>

              <div className="flex flex-wrap gap-2 items-center">
                <Select value={detail.status} onValueChange={(v) => updateStatus(detail.id, v)}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={() => sendToGestao(detail.id)} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  Enviar ao GestãoClick (mock)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
