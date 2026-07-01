import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Package, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const categoryId = params.get("categoria");

  // Sync local input when URL changes externally
  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  // Debounce keystrokes -> live search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim());
      const next = new URLSearchParams(params);
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", debounced, categoryId],
    queryFn: async () => {
      let query = supabase.from("products").select("*").eq("active", true).order("name");
      if (categoryId) query = query.eq("category_id", categoryId);
      if (debounced) {
        // Split terms — every term must match at least one field (name, code, brand, description)
        const terms = debounced.split(/\s+/).filter(Boolean).slice(0, 6);
        for (const term of terms) {
          const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
          query = query.or(
            `name.ilike.${like},code.ilike.${like},brand.ilike.${like},description.ilike.${like}`
          );
        }
      }
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data;
    },
  });

  const activeCategoryName = useMemo(
    () => categories?.find((c) => c.id === categoryId)?.name,
    [categories, categoryId]
  );

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const clearAll = () => {
    setQ("");
    setParams({});
  };

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold mb-2">Catálogo</h1>
      <p className="text-muted-foreground mb-6">Explore todos os produtos disponíveis</p>

      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Buscar</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, código, marca, descrição..."
                className="pl-9 pr-9"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dica: separe termos por espaço (ex: <em>toner hp preto</em>).
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Categorias</h3>
            <div className="space-y-1 max-h-96 overflow-auto pr-1">
              <button
                onClick={() => updateParam("categoria", null)}
                className={`w-full text-left rounded-md px-3 py-2 text-sm ${!categoryId ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                Todas
              </button>
              {categories?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => updateParam("categoria", c.id)}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm ${categoryId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section>
          {(debounced || activeCategoryName) && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {activeCategoryName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
                  Categoria: <strong>{activeCategoryName}</strong>
                  <button onClick={() => updateParam("categoria", null)} aria-label="Remover categoria"><X className="h-3 w-3" /></button>
                </span>
              )}
              {debounced && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
                  Busca: <strong>"{debounced}"</strong>
                  <button onClick={() => setQ("")} aria-label="Limpar busca"><X className="h-3 w-3" /></button>
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={clearAll}>Limpar tudo</Button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <>
              <div className="text-sm text-muted-foreground mb-3">{products.length} produto(s)</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((p) => <ProductCard key={p.id} product={p as any} />)}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">Nenhum produto encontrado</p>
              <p className="text-sm text-muted-foreground">Tente outra busca ou categoria.</p>
              <Button variant="outline" className="mt-4" onClick={clearAll}>Limpar filtros</Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
