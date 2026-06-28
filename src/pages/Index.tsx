import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "@/components/ProductCard";
import { ArrowRight, Search, Truck, Shield, Headphones } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["home-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: featured } = useQuery({
    queryKey: ["home-featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .eq("featured", true)
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <section className="relative overflow-hidden text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <div className="container-page py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wider backdrop-blur">
              Portal de Pedidos NovaPrint
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Monte seu pedido em minutos
            </h1>
            <p className="text-lg text-white/80 max-w-lg">
              Toners, cartuchos, papéis e suprimentos com agilidade. Navegue pelo catálogo, monte seu carrinho e envie sua solicitação — nossa equipe retorna com o orçamento.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/catalogo${q ? `?q=${encodeURIComponent(q)}` : ""}`);
              }}
              className="flex max-w-md gap-2"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar produto..."
                  className="pl-9 bg-white text-foreground"
                />
              </div>
              <Button type="submit" variant="secondary" className="bg-accent-brand text-accent-brand-foreground hover:bg-accent-brand/90 border-0">
                Buscar
              </Button>
            </form>
            <div className="flex flex-wrap gap-6 pt-2 text-sm text-white/80">
              <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Entrega rápida</span>
              <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Produtos originais</span>
              <span className="flex items-center gap-2"><Headphones className="h-4 w-4" /> Atendimento dedicado</span>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="aspect-square rounded-2xl bg-white/10 backdrop-blur border border-white/20 p-8 grid place-items-center">
              <div className="text-center">
                <div className="text-7xl font-black">NP</div>
                <div className="mt-2 text-sm text-white/70">Suprimentos & Impressão</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-12 md:py-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Categorias</h2>
            <p className="text-muted-foreground">Encontre o que precisa rapidamente</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories?.map((c) => (
            <Link
              key={c.id}
              to={`/catalogo?categoria=${c.id}`}
              className="rounded-xl border bg-card p-4 text-center hover:border-primary hover:shadow-[var(--shadow-md)] transition-all"
            >
              <div className="text-sm font-medium">{c.name}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Produtos em destaque</h2>
            <p className="text-muted-foreground">Os mais pedidos da NovaPrint</p>
          </div>
          <Button asChild variant="ghost">
            <Link to="/catalogo">Ver catálogo <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {featured?.map((p) => (
            <ProductCard key={p.id} product={p as any} />
          ))}
        </div>
      </section>
    </>
  );
};

export default Index;
