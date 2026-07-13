import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

export default function AdminImageReview() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  const { data: products = [], isLoading, error } = useQuery({
    queryKey: ["admin-image-review"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, brand, image_url, image_review_status, image_review_note")
        .in("image_review_status", ["suspect", "pending"])
        .not("image_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const visibleIds = useMemo(() => products.map((product) => product.id), [products]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(visibleIds) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const approveSelected = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Aprovar ${ids.length} imagem(ns) selecionada(s)? Elas passarão a aparecer no catálogo público.`)) return;

    setApproving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ image_review_status: "approved", image_review_note: null })
        .in("id", ids);
      if (error) throw error;

      toast.success(`${ids.length} imagem(ns) aprovada(s)`);
      setSelected(new Set());
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-image-review"] }),
        qc.invalidateQueries({ queryKey: ["admin-products"] }),
        qc.invalidateQueries({ queryKey: ["admin-products-counts"] }),
      ]);
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível aprovar as imagens");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Revisão de imagens</h1>
        <p className="text-sm text-muted-foreground">
          Imagens encontradas automaticamente ficam ocultas no catálogo até serem aprovadas.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={(value) => toggleAll(value === true)} />
            Selecionar todas as imagens exibidas
          </label>
          <Badge variant="secondary">{selected.size} selecionada(s)</Badge>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setSelected(new Set())} disabled={!selected.size || approving}>
              <X className="h-4 w-4 mr-1" /> Limpar seleção
            </Button>
            <Button onClick={approveSelected} disabled={!selected.size || approving}>
              {approving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Aprovar selecionadas
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="py-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {error && <div className="text-destructive">Erro ao carregar imagens: {(error as Error).message}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <Card key={product.id} className={selected.has(product.id) ? "ring-2 ring-primary" : ""}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(product.id)}
                  onCheckedChange={(value) => toggleOne(product.id, value === true)}
                  aria-label={`Selecionar ${product.name}`}
                />
                <div className="min-w-0">
                  <div className="font-medium line-clamp-2">{product.name}</div>
                  <div className="text-xs text-muted-foreground">{product.code || "Sem código"} • {product.brand || "Sem marca"}</div>
                </div>
              </div>

              <div className="aspect-square overflow-hidden rounded-md bg-muted border">
                <img src={product.image_url ?? ""} alt={product.name} className="h-full w-full object-contain" loading="lazy" />
              </div>

              <Badge variant="secondary" className="gap-1 border-warning/40 bg-warning/10 text-warning">
                <ShieldAlert className="h-3 w-3" /> Imagem suspeita
              </Badge>
              {product.image_review_note && (
                <p className="text-xs text-muted-foreground">{product.image_review_note}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && products.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhuma imagem aguardando aprovação.</CardContent></Card>
      )}
    </div>
  );
}
