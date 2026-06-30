import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PriceDisplay from "@/components/PriceDisplay";
import { ShoppingCart, Package } from "lucide-react";
import { useCart } from "@/store/cart";
import { toast } from "sonner";


export interface ProductCardProps {
  product: {
    id: string;
    name: string;
    code: string | null;
    brand: string | null;
    price: number;
    stock: number;
    image_url: string | null;
  };
}

export default function ProductCard({ product }: ProductCardProps) {
  const add = useCart((s) => s.add);
  const handleAdd = () => {
    add({
      product_id: product.id,
      name: product.name,
      code: product.code,
      price: Number(product.price),
      image_url: product.image_url,
      stock: product.stock,
    });
    toast.success(`${product.name} adicionado ao carrinho`);
  };
  return (
    <Card className="group overflow-hidden border-border/60 hover:border-primary/40 hover:shadow-[var(--shadow-md)] transition-all">
      <Link to={`/produto/${product.id}`} className="block aspect-square overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground"><Package className="h-12 w-12" /></div>
        )}
      </Link>
      <CardContent className="p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{product.brand ?? "—"}</span>
            {product.code && <span className="font-mono">{product.code}</span>}
          </div>
          <Link to={`/produto/${product.id}`} className="block font-medium leading-tight mt-1 line-clamp-2 hover:text-primary">
            {product.name}
          </Link>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-lg font-bold text-primary"><PriceDisplay value={product.price} /></div>
            <div className="text-xs text-muted-foreground">Estoque: {product.stock}</div>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={product.stock <= 0}>
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
