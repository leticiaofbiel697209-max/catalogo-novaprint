import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ShoppingBag, Inbox, AlertCircle } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [products, orders, recebidos, erros] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "recebido"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "erro_integracao"),
      ]);
      return {
        products: products.count ?? 0,
        orders: orders.count ?? 0,
        recebidos: recebidos.count ?? 0,
        erros: erros.count ?? 0,
      };
    },
  });

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
    </div>
  );
}
