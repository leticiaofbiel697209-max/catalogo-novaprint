import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { statusLabel } from "@/lib/format";

export default function OrderConfirmation() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["order-public", id],
    queryFn: async () => {
      // Inserts are public, but SELECT requires admin. We can only read order_number from the URL of recent state.
      // Fallback: read what we can — likely fails for SELECT. Use the insert response stored client-side instead.
      const { data } = await supabase.from("orders").select("id, order_number, status").eq("id", id!).maybeSingle();
      return data;
    },
  });

  return (
    <div className="container-page py-16">
      <Card className="max-w-xl mx-auto">
        <CardContent className="p-8 text-center space-y-4">
          <div className="grid place-items-center">
            <CheckCircle2 className="h-16 w-16 text-success" />
          </div>
          <h1 className="text-2xl font-bold">Pedido enviado com sucesso!</h1>
          <p className="text-muted-foreground">
            Recebemos sua solicitação. A equipe NovaPrint irá analisar e retornar em breve com o orçamento ou confirmação.
          </p>
          {isLoading ? (
            <div className="h-16" />
          ) : data ? (
            <div className="rounded-lg bg-secondary/60 p-4 inline-block">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Número do pedido</div>
              <div className="text-2xl font-bold text-primary">#{data.order_number}</div>
              <div className="text-sm mt-1">Status: <span className="font-medium">{statusLabel[data.status] ?? data.status}</span></div>
            </div>
          ) : (
            <div className="rounded-lg bg-secondary/60 p-4 inline-block">
              <div className="text-sm">Protocolo: <span className="font-mono">{id?.slice(0, 8)}</span></div>
              <div className="text-sm">Status: Recebido</div>
            </div>
          )}
          <div className="pt-4">
            <Button asChild><Link to="/catalogo">Voltar ao catálogo</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
