import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Package } from "lucide-react";
import { useState, useEffect } from "react";

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const categoryId = params.get("categoria");

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", q, categoryId],
    queryFn: async () => {
      let query = supabase.from("products").select("*").eq("active", true).order("name");
      if (categoryId) query = query.eq("category_id", categoryId);
      if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,brand.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold mb-2">Catálogo</h1>
      <p className="text-muted-foreground mb-6">Explore todos os produtos disponíveis</p>

      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Buscar</h3>
            <form onSubmit={(e) => { e.preventDefault(); updateParam("q", q); }} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, código, marca..." className="pl-9" />
            </form>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Categorias</h3>
            <div className="space-y-1">
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
              <Button variant="outline" className="mt-4" onClick={() => setParams({})}>Limpar filtros</Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
