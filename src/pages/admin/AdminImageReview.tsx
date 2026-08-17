import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 60;

export default function AdminImageReview() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-image-review-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    refetchOnWindowFocus: false,
  });

  const {
    data: pages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["admin-image-review", debouncedSearch, categoryId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam);
      const from = page * PAGE_SIZE;
      let query = (supabase as any)
        .from("products")
        .select(
          "id, name, code, brand, category_id, active, image_url, image_source_url, image_review_status, image_review_note, image_rejected_sources, categories!products_category_id_fkey(name)",
          { count: "exact" },
        )
        .in("image_review_status", ["suspect", "pending"])
        .not("image_url", "is", null)
        .order("updated_at", { ascending: false })
        .order("id");

      if (categoryId !== "all") query = query.eq("category_id", categoryId);

      if (debouncedSearch) {
        const terms = debouncedSearch.split(/\s+/).filter(Boolean).slice(0, 5);
        for (const term of terms) {
          const safe = term.replace(/[%_]/g, "\\$&");
          query = query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%,brand.ilike.%${safe}%`);
        }
      }

      const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { items: data ?? [], count: count ?? 0, page };
    },
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.page + 1) * PAGE_SIZE;
      return loaded < lastPage.count ? lastPage.page + 1 : undefined;
    },
    refetchOnWindowFocus: false,
  });

  const products = useMemo(() => pages?.pages.flatMap((page) => page.items) ?? [], [pages]);
  const totalCount = pages?.pages[0]?.count ?? 0;
  const visibleIds = useMemo(() => products.map((product: any) => product.id), [products]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-image-review"] }),
      qc.invalidateQueries({ queryKey: ["admin-products"] }),
      qc.invalidateQueries({ queryKey: ["admin-products-counts"] }),
      qc.invalidateQueries({ queryKey: ["admin-catalog-quality"] }),
    ]);
  };

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
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível aprovar as imagens");
    } finally {
      setApproving(false);
    }
  };

  const approveOne = async (id: string) => {
    setRowBusy((state) => ({ ...state, [id]: true }));
    try {
      const { error } = await supabase
        .from("products")
        .update({ image_review_status: "approved", image_review_note: null })
        .eq("id", id);
      if (error) throw error;
      setSelected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      toast.success("Imagem aprovada");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível aprovar a imagem");
    } finally {
      setRowBusy((state) => ({ ...state, [id]: false }));
    }
  };

  const rejectImage = async (product: any, retry: boolean) => {
    setRowBusy((state) => ({ ...state, [product.id]: true }));
    try {
      const rejected = Array.isArray(product.image_rejected_sources) ? product.image_rejected_sources : [];
      const source = product.image_source_url as string | null;
      const nextRejected = source && !rejected.includes(source) ? [...rejected, source] : rejected;

      const { error } = await (supabase as any)
        .from("products")
        .update({
          image_url: null,
          image_source_url: null,
          image_review_status: "approved",
          image_review_note: null,
          image_rejected_sources: nextRejected,
        })
        .eq("id", product.id);
      if (error) throw error;

      setSelected((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });

      if (retry) {
        const { data, error: fnError } = await supabase.functions.invoke("fetch-product-images", {
          body: { product_ids: [product.id], overwrite: true },
        });
        if (fnError) throw fnError;
        if ((data as any)?.updated > 0) toast.success("Imagem rejeitada. Encontrei outra opção para revisar.");
        else toast.info("Imagem rejeitada. Não encontrei outra opção segura agora.");
      } else {
        toast.success("Imagem rejeitada e removida do produto");
      }

      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível rejeitar a imagem");
    } finally {
      setRowBusy((state) => ({ ...state, [product.id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Revisão de imagens</h1>
        <p className="text-sm text-muted-foreground">
          Imagens automáticas ficam ocultas no catálogo até você aprovar. Revise por produto, marca, código e origem.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por produto, código ou marca..."
                className="pl-9"
              />
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="md:w-72"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={(value) => toggleAll(value === true)} />
              Selecionar todas as imagens carregadas
            </label>
            <Badge variant="secondary">{selected.size} selecionada(s)</Badge>
            <Badge variant="outline">Mostrando {products.length} de {totalCount}</Badge>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setSelected(new Set())} disabled={!selected.size || approving}>
                <X className="h-4 w-4 mr-1" /> Limpar seleção
              </Button>
              <Button onClick={approveSelected} disabled={!selected.size || approving}>
                {approving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Aprovar selecionadas ({selected.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="py-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {error && <div className="text-destructive">Erro ao carregar imagens: {(error as Error).message}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {products.map((product: any) => (
          <Card key={product.id} className={selected.has(product.id) ? "ring-2 ring-primary" : ""}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(product.id)}
                  onCheckedChange={(value) => toggleOne(product.id, value === true)}
                  aria-label={`Selecionar ${product.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium line-clamp-2">{product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {product.code || "Sem código"} • {product.brand || "Sem marca"}
                  </div>
                  <div className="text-xs text-muted-foreground">{product.categories?.name ?? "Sem categoria"}</div>
                </div>
                {product.active && <Badge variant="outline">Ativo</Badge>}
              </div>

              <div className="aspect-square overflow-hidden rounded-md bg-muted border">
                <img src={product.image_url ?? ""} alt={product.name} className="h-full w-full object-contain" loading="lazy" />
              </div>

              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="gap-1 border-warning/40 bg-warning/10 text-warning">
                  <ShieldAlert className="h-3 w-3" /> Aguardando revisão
                </Badge>
                {product.image_source_url && (
                  <a
                    href={product.image_source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Ver origem <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {product.image_review_note && (
                <p className="text-xs text-muted-foreground line-clamp-2">{product.image_review_note}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button size="sm" onClick={() => approveOne(product.id)} disabled={rowBusy[product.id]}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                </Button>
                <Button size="sm" variant="outline" onClick={() => rejectImage(product, true)} disabled={rowBusy[product.id]}>
                  {rowBusy[product.id] ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Outra
                </Button>
                <Button size="sm" variant="ghost" onClick={() => rejectImage(product, false)} disabled={rowBusy[product.id]}>
                  <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Rejeitar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && products.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhuma imagem aguardando aprovação com esses filtros.</CardContent></Card>
      )}

      {hasNextPage && (
        <div className="py-4 text-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Carregar mais imagens
          </Button>
        </div>
      )}
    </div>
  );
}
