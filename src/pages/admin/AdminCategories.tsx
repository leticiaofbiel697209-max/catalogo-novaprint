import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, WandSparkles, CheckCircle2, XCircle, StopCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminCategories() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; suggested: number; unresolved: number; remaining: number } | null>(null);
  const stopRef = useRef(false);

  const { data: categories } = useQuery({
    queryKey: ["admin-all-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: suggestions } = useQuery({
    queryKey: ["category-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,code,brand,category_id,suggested_category_id,category_confidence,category_rule,category_review_status")
        .eq("category_review_status", "suggested")
        .is("category_id", null)
        .order("category_confidence", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoryMap = new Map((categories ?? []).map((c: any) => [c.id, c.name]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("categories").insert({ name, description: desc || null });
      if (error) throw error;
      setName(""); setDesc("");
      qc.invalidateQueries({ queryKey: ["admin-all-categories"] });
      toast.success("Categoria criada");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("categories").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-all-categories"] });
  };

  const classifyMissing = async () => {
    if (!confirm("Analisar produtos sem categoria e gerar sugestões? Nenhuma categoria pública será alterada sem sua aprovação.")) return;
    setClassifying(true);
    stopRef.current = false;
    const totals = { processed: 0, suggested: 0, unresolved: 0, remaining: 0 };
    setProgress({ ...totals });
    try {
      for (let i = 0; i < 30; i++) {
        if (stopRef.current) break;
        const { data, error } = await supabase.functions.invoke("suggest-product-categories", { body: { limit: 50 } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        totals.processed += data.processed ?? 0;
        totals.suggested += data.suggested ?? 0;
        totals.unresolved += data.unresolved ?? 0;
        totals.remaining = data.remaining ?? 0;
        setProgress({ ...totals });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["category-suggestions"] }),
          qc.invalidateQueries({ queryKey: ["catalog-quality"] }),
          qc.invalidateQueries({ queryKey: ["admin-all-categories"] }),
        ]);
        if ((data.processed ?? 0) === 0 || (data.remaining ?? 0) === 0) break;
      }
      toast.success(`${totals.suggested} sugestão(ões) criada(s); ${totals.unresolved} produto(s) sem regra segura.`);
    } catch (e: any) { toast.error(e.message ?? "Erro ao classificar produtos"); }
    finally { setClassifying(false); }
  };

  const approve = async (p: any) => {
    if (!p.suggested_category_id) return;
    const { error } = await supabase.from("products").update({
      category_id: p.suggested_category_id,
      suggested_category_id: null,
      category_review_status: "approved",
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Categoria aprovada");
    qc.invalidateQueries({ queryKey: ["category-suggestions"] });
    qc.invalidateQueries({ queryKey: ["catalog-quality"] });
  };

  const reject = async (p: any) => {
    const { error } = await supabase.from("products").update({
      suggested_category_id: null,
      category_confidence: null,
      category_rule: null,
      category_review_status: "rejected",
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Sugestão rejeitada");
    qc.invalidateQueries({ queryKey: ["category-suggestions"] });
    qc.invalidateQueries({ queryKey: ["catalog-quality"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Categorias</h1>
          <p className="text-muted-foreground text-sm">Padronize o catálogo e revise sugestões automáticas sem IA.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={classifyMissing} disabled={classifying}>
            {classifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WandSparkles className="h-4 w-4 mr-2" />}
            Sugerir categorias para produtos sem categoria
          </Button>
          {classifying && <Button variant="outline" onClick={() => { stopRef.current = true; }}><StopCircle className="h-4 w-4 mr-2" />Parar</Button>}
        </div>
      </div>

      {progress && (
        <Card><CardContent className="p-4 flex flex-wrap gap-4 text-sm">
          <span>Processados: <strong>{progress.processed}</strong></span>
          <span>Sugestões: <strong>{progress.suggested}</strong></span>
          <span>Sem regra segura: <strong>{progress.unresolved}</strong></span>
          <span>Restantes: <strong>{progress.remaining}</strong></span>
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-4">
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <Button disabled={saving || !name}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <div className="font-semibold">Fila de revisão de categorias</div>
            <div className="text-sm text-muted-foreground">A sugestão não aparece como categoria oficial até você aprovar.</div>
          </div>
          <div className="divide-y">
            {suggestions?.map((p: any) => (
              <div key={p.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{[p.brand, p.code].filter(Boolean).join(" · ") || "Sem marca/código"}</div>
                  {p.category_rule && <div className="text-xs text-muted-foreground mt-1">Regra: {p.category_rule}</div>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{categoryMap.get(p.suggested_category_id) ?? "Categoria sugerida"}</Badge>
                  <Badge variant={(Number(p.category_confidence) >= 80 ? "default" : "outline") as any}>{Math.round(Number(p.category_confidence) || 0)}% confiança</Badge>
                  <Button size="sm" onClick={() => approve(p)}><CheckCircle2 className="h-4 w-4 mr-1" />Aprovar</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(p)}><XCircle className="h-4 w-4 mr-1" />Rejeitar</Button>
                </div>
              </div>
            ))}
            {(!suggestions || suggestions.length === 0) && <div className="p-8 text-center text-muted-foreground">Nenhuma sugestão aguardando revisão.</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          <div className="p-4 font-semibold">Categorias cadastradas</div>
          {categories?.map((c: any) => (
            <div key={c.id} className="flex items-center gap-4 p-4">
              <div className="flex-1"><div className="font-medium">{c.name}</div>{c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}</div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={c.active} onCheckedChange={(v) => toggle(c.id, v)} />{c.active ? "Ativa" : "Inativa"}</label>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
