import { Link } from "react-router-dom";
import { useCart } from "@/store/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PriceDisplay from "@/components/PriceDisplay";
import { Trash2, Minus, Plus, ShoppingCart, ArrowRight, Package, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCatalogShowPrices } from "@/hooks/useCatalogPriceVisibility";

export default function Cart() {
  const { items, setQty, remove, total } = useCart();
  const showPrices = useCatalogShowPrices();

  if (items.length === 0) {
    return (
      <div className="container-page py-16 text-center max-w-md mx-auto">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-2xl font-bold">Seu carrinho está vazio</h1>
        <p className="text-muted-foreground mt-2">Adicione produtos para montar seu pedido.</p>
        <Button asChild className="mt-6"><Link to="/catalogo">Ver catálogo</Link></Button>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold mb-4">Carrinho</h1>

      {!showPrices && (
        <Alert className="mb-6 border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle>Preços "Sob consulta"</AlertTitle>
          <AlertDescription>
            Neste momento os preços estão como <strong>"Sob consulta"</strong>. Envie o pedido normalmente — a equipe NovaPrint retorna com o orçamento oficial e condições de pagamento.
          </AlertDescription>
        </Alert>
      )}

      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertTitle>Como enviar seu pedido</AlertTitle>
        <AlertDescription>
          Confira os itens abaixo, ajuste as quantidades e clique em <strong>"Finalizar pedido"</strong>. Preencha seus dados de contato na próxima etapa — nossa equipe recebe a solicitação e retorna com o orçamento e as condições de entrega.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-3">
          {items.map((i) => (
            <Card key={i.product_id}>
              <CardContent className="p-4 flex gap-4 items-center">
                <div className="h-20 w-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  {i.image_url ? <img src={i.image_url} className="h-full w-full object-cover" alt={i.name} /> : <div className="h-full grid place-items-center"><Package className="h-6 w-6 text-muted-foreground" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/produto/${i.product_id}`} className="font-medium hover:text-primary line-clamp-2">{i.name}</Link>
                  <div className="text-xs text-muted-foreground mt-0.5">{i.code}</div>
                  <div className="text-sm text-muted-foreground"><PriceDisplay value={i.price} /> un.</div>
                </div>
                <div className="flex items-center border rounded-md">
                  <Button variant="ghost" size="icon" onClick={() => setQty(i.product_id, i.quantity - 1)}><Minus className="h-4 w-4" /></Button>
                  <Input type="number" value={i.quantity} onChange={(e) => setQty(i.product_id, Math.max(1, Number(e.target.value) || 1))} className="w-14 border-0 text-center" />
                  <Button variant="ghost" size="icon" onClick={() => setQty(i.product_id, i.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="text-right w-24">
                  <div className="font-bold text-primary"><PriceDisplay value={i.price * i.quantity} /></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(i.product_id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <aside>
          <Card className="sticky top-20">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold text-lg">Resumo</h2>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Itens</span>
                <span>{items.reduce((a, i) => a + i.quantity, 0)}</span>
              </div>
              <div className="border-t pt-4 flex justify-between items-baseline">
                <span className="font-medium">Total</span>
                <span className="text-2xl font-bold text-primary"><PriceDisplay value={total()} /></span>
              </div>
              <Button asChild size="lg" className="w-full">
                <Link to="/checkout">Finalizar pedido <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/catalogo">Continuar comprando</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
