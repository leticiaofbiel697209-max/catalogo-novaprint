import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, SearchCheck } from "lucide-react";
import { toast } from "sonner";

const labels: Record<string, string> = {
  ok: "Imagem utilizável encontrada",
  bing_blocked: "Bing bloqueou a consulta",
  parser_zero_candidates: "Bing respondeu, mas o parser encontrou 0 imagens",
  score_rejected_all: "Imagens encontradas, mas todas foram rejeitadas pela pontuação",
  downloads_rejected: "Imagens aprovadas, mas os downloads falharam",
};

export default function AdminImageDiagnostics() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("diagnose-product-images", { body: { limit: 5 } });
      if (error) throw error;
      setResult(data);
      toast.success("Diagnóstico concluído. Nenhuma imagem foi gravada.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro no diagnóstico");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico de imagens</h1>
          <p className="text-sm text-muted-foreground">Testa até 5 produtos sem imagem sem alterar o catálogo.</p>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <SearchCheck className="h-4 w-4 mr-2" />}
          Testar 5 produtos
        </Button>
      </div>

      {result?.results?.map((item: any) => (
        <Card key={item.product.id}>
          <CardContent className="p-4 space-y-2">
            <div className="font-semibold">{item.product.name}</div>
            <div className="text-sm">Resultado: <strong>{labels[item.diagnosis] ?? item.diagnosis}</strong></div>
            <div className="text-xs text-muted-foreground">Candidatos: {item.rawCandidates} • Acima do score: {item.eligibleCandidates} • Downloads testados: {item.downloads?.length ?? 0}</div>
            <details className="text-xs">
              <summary className="cursor-pointer">Ver consultas</summary>
              <div className="mt-2 space-y-1">
                {item.queries?.map((q: any, i: number) => (
                  <div key={i} className="border rounded p-2">
                    <div>{q.query}</div>
                    <div>HTTP {q.httpStatus ?? "-"} • {q.candidateCount} candidatos • {q.elapsedMs} ms</div>
                    {q.error && <div className="text-destructive">{q.error}</div>}
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
