import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ShoppingBag, Inbox, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCatalogShowPrices, setCatalogShowPrices } from "@/hooks/useCatalogPriceVisibility";
import { toast } from "sonner";
import { useState } from "react";

export default function AdminDashboard() {
  const qc = useQueryClient();
  const showPrices = useCatalogShowPrices();
  const [saving, setSaving] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [products, orders, recebidos, erros, pendingReqs] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "recebido"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "erro_integracao"),
        supabase.from("admin_access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return {
        products: products.count ?? 0,
        orders: orders.count ?? 0,
        recebidos: recebidos.count ?? 0,
        erros: erros.count ?? 0,
        pendingReqs: pendingReqs.count ?? 0,
      };
    },
  });

  const togglePrices = async (checked: boolean) => {
    setSaving(true);
    try {
      await setCatalogShowPrices(checked);
      await qc.invalidateQueries({ queryKey: ["settings", "catalog_show_prices"] });
      toast.success(checked ? "Preços visíveis para clientes" : "Preços ocultos — clientes verão 'Sob consulta'");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    { label: "Produtos ativos", value: stats?.products ?? 0, icon: Package, color: "text-primary bg-primary/10" },
    { label: "Total de pedidos", value: stats?.orders ?? 0, icon: ShoppingBag, color: "text-success bg-success/10" },
    { label: "Pedidos recebidos", value: stats?.recebidos ?? 0, icon: Inbox, color: "text-warning bg-warning/10" },
    { label: "Erros de integração", value: stats?.erros ?? 0, icon: AlertCircle, color: "text-destructive bg-destructive/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do portal</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`grid h-12 w-12 place-items-center rounded-lg ${c.color}`}>
                <c.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 flex items-center gap-4 flex-wrap">
          <div className={`grid h-12 w-12 place-items-center rounded-lg ${showPrices ? "text-success bg-success/10" : "text-muted-foreground bg-muted"}`}>
            {showPrices ? <Eye className="h-6 w-6" /> : <EyeOff className="h-6 w-6" />}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold">Exibir preços no catálogo público</div>
            <p className="text-sm text-muted-foreground">
              Quando desligado, todos os visitantes veem <strong>"Sob consulta"</strong> em vez do valor. Ideal quando você prefere responder com orçamento personalizado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Label htmlFor="show-prices" className="text-sm">{showPrices ? "Visíveis" : "Ocultos"}</Label>
            <Switch id="show-prices" checked={showPrices} onCheckedChange={togglePrices} disabled={saving} />
          </div>
        </CardContent>
      </Card>

      {(stats?.pendingReqs ?? 0) > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 text-sm">
            📬 Você tem <strong>{stats?.pendingReqs}</strong> solicitação(ões) de acesso administrativo pendente(s). Acesse <a href="/admin/administradores" className="text-primary underline">Administradores</a>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
