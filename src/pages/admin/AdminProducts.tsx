import { useRef, useState, useMemo } from "react";
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
import { Plus, Pencil, Upload, Loader2, Sparkles, ImageDown, FileSpreadsheet, Search, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { useCatalogShowPrices, setCatalogShowPrices } from "@/hooks/useCatalogPriceVisibility";



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
  const [importingSheet, setImportingSheet] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [missingFilter, setMissingFilter] = useState<string>("all");
  const [hidingNoImage, setHidingNoImage] = useState(false);
  const showPrices = useCatalogShowPrices();
  const [savingPrices, setSavingPrices] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const hideAllWithoutImage = async () => {
    if (!confirm("Ocultar do catálogo todos os produtos sem imagem? Você poderá reativá-los individualmente depois.")) return;
    setHidingNoImage(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .update({ active: false })
        .or("image_url.is.null,image_url.eq.")
        .eq("active", true)
        .select("id");
      if (error) throw error;
      toast.success(`${data?.length ?? 0} produto(s) sem imagem ocultado(s)`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setHidingNoImage(false);
    }
  };

  const togglePrices = async (checked: boolean) => {
    setSavingPrices(true);
    try {
      await setCatalogShowPrices(checked);
      await qc.invalidateQueries({ queryKey: ["settings", "catalog_show_prices"] });
      toast.success(checked ? "Preços visíveis no catálogo" : "Preços ocultos — clientes verão 'Sob consulta'");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSavingPrices(false);
    }
  };


  const callFn = async (name: string, body: any) => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  };

  const bulkGenerateDescriptions = async () => {
    if (!confirm("Gerar descrições com IA para todos os produtos sem descrição? Pode levar alguns minutos.")) return;
    setBulkAi(true);
    try {
      const data = await callFn("generate-product-descriptions", { limit: 50 });
      if (data.errors?.length) {
        toast.error(`${data.updated} gerada(s). Erro: ${data.errors[0].error}`);
      } else {
        toast.success(`${data.updated} descrição(ões) gerada(s)`);
      }
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message ?? "Erro ao gerar descrições"); }
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
      const data = await callFn("generate-product-descriptions", { product_ids: [id], overwrite: true });
      if (data.errors?.length) toast.error(data.errors[0].error);
      else toast.success("Descrição gerada");
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

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p: any) => {
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      const noImage = !p.image_url;
      const noDesc = !p.description || !String(p.description).trim();
      if (missingFilter === "no_image" && !noImage) return false;
      if (missingFilter === "no_description" && !noDesc) return false;
      if (missingFilter === "no_both" && !(noImage && noDesc)) return false;
      if (missingFilter === "no_any" && !(noImage || noDesc)) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.categories?.name?.toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter, missingFilter]);

  const counts = useMemo(() => {
    const list = products ?? [];
    let noImg = 0, noDesc = 0, both = 0;
    for (const p of list as any[]) {
      const ni = !p.image_url;
      const nd = !p.description || !String(p.description).trim();
      if (ni) noImg++;
      if (nd) noDesc++;
      if (ni && nd) both++;
    }
    return { total: list.length, noImg, noDesc, both };
  }, [products]);


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


  const normalizeHeader = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const parseMoney = (value: unknown) => {
    if (value === null || value === undefined) return 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const cleaned = raw
      .replace(/R\$/gi, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const parseInteger = (value: unknown) => {
    const n = parseMoney(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  };

  const parseCsvLine = (line: string, delimiter: string) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    return cells;
  };

  const parseDelimitedText = (text: string) => {
    const cleanText = text.replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];

    const firstLine = lines[0];
    const candidates = [";", ",", "\t"];
    const delimiter = candidates
      .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
      .sort((a, b) => b.count - a.count)[0].candidate;

    return lines.map((line) => parseCsvLine(line, delimiter));
  };

  const parseHtmlTable = (text: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const rows = Array.from(doc.querySelectorAll("table tr"));
    return rows
      .map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""))
      .filter((row) => row.some(Boolean));
  };

  const getCell = (row: Record<string, string>, aliases: string[]) => {
    for (const alias of aliases) {
      const key = normalizeHeader(alias);
      if (row[key] !== undefined && String(row[key]).trim() !== "") return String(row[key]).trim();
    }
    return "";
  };

  const importGestaoClickSheet = async (file: File) => {
    setImportingSheet(true);
    try {
      const text = await file.text();
      const isHtml = /<table|<html|<tr|<td/i.test(text);
      const rows = isHtml ? parseHtmlTable(text) : parseDelimitedText(text);

      if (rows.length < 2) {
        throw new Error("Não consegui ler a planilha. Exporte do GestãoClick em CSV ou Excel .xls/HTML e tente novamente.");
      }

      const headers = rows[0].map(normalizeHeader);
      const records = rows.slice(1).map((cells) => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => { record[header] = cells[index] ?? ""; });
        return record;
      });

      const categoryCache = new Map<string, string>();
      (categories ?? []).forEach((category: any) => categoryCache.set(normalizeHeader(category.name), category.id));

      let imported = 0;
      let skipped = 0;
      let costsUpdated = 0;

      for (const record of records) {
        const name = getCell(record, ["Nome", "Produto", "Descrição", "Descricao", "Nome do produto", "Produto/Serviço", "Produto Serviço"]);
        const code = getCell(record, ["Código", "Codigo", "Cod", "SKU", "Referência", "Referencia", "ID", "Nº", "Numero"]);
        const brand = getCell(record, ["Marca", "Fabricante"]);
        const categoryName = getCell(record, ["Categoria", "Grupo", "Departamento", "Família", "Familia"]);
        const description = getCell(record, ["Descrição detalhada", "Descricao detalhada", "Observação", "Observacao", "Detalhes"]);
        const imageUrl = getCell(record, ["Imagem", "URL imagem", "Image URL", "Foto", "URL"]);
        const price = parseMoney(getCell(record, ["Preço", "Preco", "Preço venda", "Preco venda", "Valor", "Valor venda", "Venda"]));
        const costPrice = parseMoney(getCell(record, ["Custo", "Preço custo", "Preco custo", "Valor custo", "Custo médio", "Custo medio"]));
        const stock = parseInteger(getCell(record, ["Estoque", "Saldo", "Quantidade", "Qtd", "Disponível", "Disponivel"]));

        if (!name) {
          skipped += 1;
          continue;
        }

        let categoryId: string | null = null;
        if (categoryName) {
          const normalizedCategory = normalizeHeader(categoryName);
          categoryId = categoryCache.get(normalizedCategory) ?? null;

          if (!categoryId) {
            const { data: newCategory, error: categoryError } = await supabase
              .from("categories")
              .insert({ name: categoryName })
              .select("id")
              .single();
            if (categoryError) throw categoryError;
            categoryId = newCategory.id;
            categoryCache.set(normalizedCategory, categoryId);
          }
        }

        const productPayload = {
          name,
          code: code || null,
          brand: brand || null,
          category_id: categoryId,
          description: description || null,
          price,
          stock,
          image_url: imageUrl || null,
          active: true,
        };

        let productId: string | null = null;

        if (code) {
          const { data, error } = await supabase
            .from("products")
            .upsert(productPayload, { onConflict: "code" })
            .select("id")
            .single();
          if (error) throw error;
          productId = data.id;
        } else {
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("name", name)
            .maybeSingle();

          const { data, error } = existing?.id
            ? await supabase.from("products").update(productPayload).eq("id", existing.id).select("id").single()
            : await supabase.from("products").insert(productPayload).select("id").single();
          if (error) throw error;
          productId = data.id;
        }

        if (productId && costPrice > 0) {
          const { error: costError } = await supabase
            .from("product_costs")
            .upsert({ product_id: productId, cost_price: costPrice }, { onConflict: "product_id" });
          if (costError) throw costError;
          costsUpdated += 1;
        }

        imported += 1;
      }

      toast.success(`${imported} produto(s) importado(s). ${costsUpdated} custo(s) atualizado(s). ${skipped} linha(s) ignorada(s).`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar planilha");
    } finally {
      setImportingSheet(false);
      if (importInputRef.current) importInputRef.current.value = "";
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-muted-foreground text-sm">Gerencie o catálogo</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.txt,.tsv,.xls,.html"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importGestaoClickSheet(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importingSheet}>
            {importingSheet ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
            Importar planilha
          </Button>
          <Button variant="outline" onClick={bulkFetchImages} disabled={bulkImg}>
            {bulkImg ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImageDown className="h-4 w-4 mr-1" />}
            Buscar imagens
          </Button>
          <Button variant="outline" onClick={bulkGenerateDescriptions} disabled={bulkAi}>
            {bulkAi ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Gerar descrições com IA
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ou marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-64"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={missingFilter} onValueChange={setMissingFilter}>
          <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            <SelectItem value="no_image">Sem imagem ({counts.noImg})</SelectItem>
            <SelectItem value="no_description">Sem descrição ({counts.noDesc})</SelectItem>
            <SelectItem value="no_both">Sem imagem e sem descrição ({counts.both})</SelectItem>
            <SelectItem value="no_any">Sem imagem ou descrição</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={hideAllWithoutImage} disabled={hidingNoImage} title="Desativa todos os produtos que não possuem imagem">
          {hidingNoImage ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <EyeOff className="h-4 w-4 mr-1" />}
          Ocultar sem imagem
        </Button>
      </div>

      <Card className={showPrices ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}>
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          <div className={`grid h-10 w-10 place-items-center rounded-lg ${showPrices ? "text-success bg-success/10" : "text-warning bg-warning/10"}`}>
            {showPrices ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="font-semibold text-sm">Exibir preços no catálogo público</div>
            <p className="text-xs text-muted-foreground">
              Controla se os clientes veem os preços de todos os produtos ou <strong>"Sob consulta"</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savingPrices && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Label htmlFor="show-prices-products" className="text-sm">{showPrices ? "Visíveis" : "Ocultos"}</Label>
            <Switch id="show-prices-products" checked={showPrices} onCheckedChange={togglePrices} disabled={savingPrices} />
          </div>
        </CardContent>
      </Card>



      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2 text-xs text-muted-foreground border-b">
            {filteredProducts.length} produto(s)
          </div>
          <div className="divide-y">
            {filteredProducts.map((p: any) => (

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
                <label className="flex items-center gap-2 text-xs cursor-pointer" title={p.active ? "Visível no catálogo" : "Oculto"}>
                  <Switch
                    checked={p.active}
                    onCheckedChange={async (v) => {
                      await supabase.from("products").update({ active: v }).eq("id", p.id);
                      qc.invalidateQueries({ queryKey: ["admin-products"] });
                      toast.success(v ? "Produto visível" : "Produto oculto");
                    }}
                  />
                  {p.active ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                </label>
                <Button size="icon" variant="ghost" title="Buscar imagem na web" onClick={() => fetchOneImage(p.id)} disabled={rowBusy[p.id] === "img"}>
                  {rowBusy[p.id] === "img" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" title="Gerar descrição com IA" onClick={() => regenDescription(p.id)} disabled={rowBusy[p.id] === "ai"}>
                  {rowBusy[p.id] === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                {products && products.length > 0 ? "Nenhum produto corresponde aos filtros." : "Nenhum produto cadastrado."}
              </div>
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
