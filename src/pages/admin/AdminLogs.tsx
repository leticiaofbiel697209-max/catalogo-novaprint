import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminLogs() {
  const { data: logs } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("integration_logs").select("*").order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Logs de integração</h1>
        <p className="text-muted-foreground text-sm">Histórico de envios ao GestãoClick</p>
      </div>
      <Card>
        <CardContent className="p-0 divide-y">
          {logs?.map((l: any) => (
            <details key={l.id} className="p-4">
              <summary className="cursor-pointer flex items-center gap-3 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === "sucesso" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{l.status}</span>
                <span className="font-medium">{l.action}</span>
                <span className="text-muted-foreground">• {l.service}</span>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
              </summary>
              {l.error_message && <div className="mt-2 text-sm text-destructive">{l.error_message}</div>}
              <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-60">{JSON.stringify(l.response_payload ?? l.request_payload, null, 2)}</pre>
            </details>
          ))}
          {(!logs || logs.length === 0) && <div className="p-8 text-center text-muted-foreground">Nenhum log ainda.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
