import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";
import { ArrowLeft, Minus, Plus, Package, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/store/cart";
import { toast } from "sonner";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("id", id!)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="container-page py-10">Carregando...</div>;
  if (!data) {
    return (
      <div className="container-page py-16 text-center">
        <p className="text-lg">Produto não encontrado.</p>
        <Button asChild className="mt-4"><Link to="/catalogo">Voltar ao catálogo</Link></Button>
      </div>
    );
  }

  const handleAdd = () => {
    add({
      product_id: data.id,
      name: data.name,
      code: data.code,
      price: Number(data.price),
      image_url: data.image_url,
      stock: data.stock,
    }, qty);
    toast.success("Adicionado ao carrinho");
    navigate("/carrinho");
  };

  return (
    <div className="container-page py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/catalogo"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square rounded-2xl overflow-hidden bg-muted border">
          {data.image_url ? (
            <img src={data.image_url} alt={data.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grid place-items-center text-muted-foreground"><Package className="h-16 w-16" /></div>
          )}
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {data.categories?.name && <span className="rounded-full bg-secondary px-2 py-0.5">{data.categories.name}</span>}
            {data.brand && <span>{data.brand}</span>}
            {data.code && <span className="font-mono">• {data.code}</span>}
          </div>
          <h1 className="text-3xl font-bold leading-tight">{data.name}</h1>
          <div className="text-3xl font-bold text-primary">{formatBRL(data.price)}</div>
          <div className="text-sm text-muted-foreground">
            {data.stock > 0 ? `${data.stock} unidade(s) em estoque` : "Sem estoque no momento"}
          </div>
          {data.description && <p className="text-foreground/80 leading-relaxed pt-2">{data.description}</p>}

          <div className="flex items-center gap-3 pt-4">
            <div className="flex items-center border rounded-md">
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
              <Input
                type="number"
                value={qty}
                min={1}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 border-0 text-center"
              />
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => q + 1)}><Plus className="h-4 w-4" /></Button>
            </div>
            <Button onClick={handleAdd} disabled={data.stock <= 0} size="lg" className="flex-1">
              <ShoppingCart className="h-4 w-4 mr-2" /> Adicionar ao carrinho
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
