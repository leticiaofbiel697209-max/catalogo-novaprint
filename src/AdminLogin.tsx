import { useCart } from "@/store/cart";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatCNPJ, formatPhone } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1, "Informe seu nome").max(120),
  company: z.string().trim().min(1, "Informe a empresa").max(160),
  cnpj: z.string().max(20).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  email: z.string().email("E-mail inválido").max(160).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
}).refine((d) => (d.phone && d.phone.trim().length > 0) || (d.email && d.email.trim().length > 0), {
  message: "Informe telefone ou e-mail",
  path: ["phone"],
});

type FormValues = z.infer<typeof schema>;

export default function Checkout() {
  const navigate = useNavigate();
  const { items, total, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", company: "", cnpj: "", phone: "", email: "", notes: "" },
  });

  if (items.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <p>Seu carrinho está vazio.</p>
        <Button className="mt-4" onClick={() => navigate("/catalogo")}>Ir ao catálogo</Button>
      </div>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const { data: customer, error: cErr } = await supabase
        .from("customers")
        .insert({
          name: values.name,
          company: values.company,
          cnpj: values.cnpj || null,
          phone: values.phone || null,
          email: values.email || null,
        })
        .select()
        .single();
      if (cErr) throw cErr;

      const totalValue = total();
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          customer_id: customer.id,
          total_value: totalValue,
          status: "recebido",
          notes: values.notes || null,
        })
        .select()
        .single();
      if (oErr) throw oErr;

      const orderItems = items.map((i) => ({
        order_id: order.id,
        product_id: i.product_id,
        product_name: i.name,
        product_code: i.code,
        quantity: i.quantity,
        unit_price: i.price,
        total_price: i.price * i.quantity,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(orderItems);
      if (iErr) throw iErr;

      clear();
      navigate(`/pedido/${order.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Erro ao enviar pedido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-bold mb-6">Finalizar pedido</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-lg">Seus dados</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="company">Empresa *</Label>
                <Input id="company" {...register("company")} />
                {errors.company && <p className="text-xs text-destructive mt-1">{errors.company.message}</p>}
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={watch("cnpj") ?? ""}
                  onChange={(e) => setValue("cnpj", formatCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={watch("phone") ?? ""}
                  onChange={(e) => setValue("phone", formatPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                />
                {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" {...register("email")} placeholder="seu@email.com" />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" rows={4} {...register("notes")} placeholder="Detalhes do pedido, prazo desejado, etc." />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">* Telefone ou e-mail é obrigatório para retorno.</p>
          </CardContent>
        </Card>

        <aside>
          <Card className="sticky top-20">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold text-lg">Resumo do pedido</h2>
              <div className="space-y-2 max-h-72 overflow-auto">
                {items.map((i) => (
                  <div key={i.product_id} className="flex justify-between text-sm gap-2">
                    <span className="line-clamp-1">{i.quantity}× {i.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{formatBRL(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 flex justify-between items-baseline">
                <span className="font-medium">Total</span>
                <span className="text-2xl font-bold text-primary">{formatBRL(total())}</span>
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar pedido
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Sua solicitação será analisada pela equipe NovaPrint.
              </p>
            </CardContent>
          </Card>
        </aside>
      </form>
    </div>
  );
}
