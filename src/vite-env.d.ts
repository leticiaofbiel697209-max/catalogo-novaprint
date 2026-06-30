import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminCategories() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["admin-all-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return data ?? [];
    },
  });

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
    await supabase.from("categories").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-all-categories"] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Categorias</h1>
        <p className="text-muted-foreground text-sm">Organize os produtos</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <Button disabled={saving || !name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {categories?.map((c) => (
            <div key={c.id} className="flex items-center gap-4 p-4">
              <div className="flex-1">
                <div className="font-medium">{c.name}</div>
                {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={c.active} onCheckedChange={(v) => toggle(c.id, v)} />
                {c.active ? "Ativa" : "Inativa"}
              </label>
            </div>
          ))}
          {(!categories || categories.length === 0) && <div className="p-8 text-center text-muted-foreground">Nenhuma categoria.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
