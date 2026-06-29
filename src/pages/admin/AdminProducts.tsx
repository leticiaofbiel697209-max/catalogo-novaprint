import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Upload, Loader2, Sparkles, ImageDown } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

interface ProductForm {
  id?: string;
  name: string;
  code: string;
  brand: string;
  category_id: string | null;
  description: string;
  price: string;
  cost_price: string;
  stock: string;
  image_url: string;
  featured: boolean;
  active: boolean;
}

const empty: ProductForm = {
  name: "", code: "", brand: "", category_id: null, description: "",
  price: "0", cost_price: "0", stock: "0", image_url: "", featured: false, active: true,
};

export default function AdminProducts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkAi, setBulkAi] = useState(false);
  const [bulkImg, setBulkImg] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, "ai" | "img" | null>>({});

  const callFn = async (name: string, body: any) => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  };

  const bulkGenerateDescriptions = async () => {
    if (!confirm("Gerar descrições com IA para todos os produtos sem descrição? Pode levar alguns minutos.")) return;
    setBulkAi(true);
    try {
      const data = await callFn("generate-product-descriptions", {});
      toast.success(`${data.updated} descrição(ões) gerada(s)`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkAi(false); }
  };

  const bulkFetchImages = async () => {
    if (!confirm("Buscar imagens automaticamente para todos os produtos sem imagem? Pode levar vários minutos e a qualidade varia.")) return;
    setBulkImg(true);
    try {
      const data = await callFn("fetch-product-images", {});
      toast.success(`${data.updated} imagem(ns) vinculada(s)`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkImg(false); }
  };

  const regenDescription = async (id: string) => {
    setRowBusy((s) => ({ ...s, [id]: "ai" }));
    try {
      await callFn("generate-product-descriptions", { product_ids: [id], overwrite: true });
      toast.success("Descrição gerada");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setRowBusy((s) => ({ ...s, [id]: null })); }
  };

  const fetchOneImage = async (id: string) => {
    setRowBusy((s) => ({ ...s, [id]: "img" }));
    try {
      const data = await callFn("fetch-product-images", { product_ids: [id], overwrite: true });
      if (data.updated > 0) toast.success("Imagem vinculada");
      else toast.error(data.errors?.[0]?.error ?? "Não encontrei imagem");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setRowBusy((s) => ({ ...s, [id]: null })); }
  };

  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*, categories(name), product_costs(cost_price)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return data ?? [];
    },
  });

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (p: any) => {
    const cost = p.product_costs?.cost_price ?? p.cost_price ?? 0;
    setForm({
      id: p.id, name: p.name, code: p.code ?? "", brand: p.brand ?? "",
      category_id: p.category_id, description: p.description ?? "",
      price: String(p.price), cost_price: String(cost), stock: String(p.stock), image_url: p.image_url ?? "",
      featured: p.featured, active: p.active,
    });
    setOpen(true);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (sErr) throw sErr;
      setForm((f) => ({ ...f, image_url: signed.signedUrl }));
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code || null,
        brand: form.brand || null,
        category_id: form.category_id,
        description: form.description || null,
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
        image_url: form.image_url || null,
        featured: form.featured,
        active: form.active,
      };
      const { error, data } = form.id
        ? await supabase.from("products").update(payload).eq("id", form.id).select("id").single()
        : await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      const productId = data?.id ?? form.id;
      if (productId) {
        const { error: costErr } = await supabase.from("product_costs").upsert(
          { product_id: productId, cost_price: Number(form.cost_price) || 0 },
          { onConflict: "product_id" }
        );
        if (costErr) throw costErr;
      }
      toast.success(form.id ? "Produto atualizado" : "Produto criado");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-muted-foreground text-sm">Gerencie o catálogo</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {products?.map((p: any) => (
              <div key={p.id} className="flex items-center gap-4 p-4">
                <div className="h-14 w-14 rounded bg-muted overflow-hidden flex-shrink-0">
                  {p.image_url && <img src={p.image_url} className="h-full w-full object-cover" alt="" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium line-clamp-1">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.code} • {p.brand} • {p.categories?.name ?? "Sem categoria"}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold text-primary">{formatBRL(p.price)}</div>
                  <div className="text-xs text-muted-foreground">Custo: {formatBRL(p.product_costs?.cost_price ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">Estoque: {p.stock}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${p.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {p.active ? "Ativo" : "Inativo"}
                </span>
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
              </div>
            ))}
            {(!products || products.length === 0) && (
              <div className="p-8 text-center text-muted-foreground">Nenhum produto cadastrado.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <Label>Marca</Label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preço de venda (R$)</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <Label>Preço de custo (R$)</Label>
              <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div>
              <Label>Estoque</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Imagem</Label>
              <div className="flex gap-2 items-center">
                <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL ou faça upload" />
                <label className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  <Button type="button" variant="outline" disabled={uploading} asChild>
                    <span>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</span>
                  </Button>
                </label>
              </div>
              {form.image_url && <img src={form.image_url} className="mt-2 h-24 w-24 rounded object-cover border" alt="preview" />}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} /> Em destaque
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativo
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.name}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
