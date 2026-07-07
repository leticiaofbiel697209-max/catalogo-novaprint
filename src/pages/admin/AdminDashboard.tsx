import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Package, ShoppingBag, Inbox, AlertCircle, Eye, EyeOff, Loader2, Image as ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCatalogShowPrices, setCatalogShowPrices } from "@/hooks/useCatalogPriceVisibility";
import { useSetting, setSetting } from "@/hooks/useSetting";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export default function AdminDashboard() {
  const qc = useQueryClient();
  const showPrices = useCatalogShowPrices();
  const [saving, setSaving] = useState(false);
  const bannerVisible = useSetting("home_banner_visible") === "true";
  const bannerTitle = useSetting("home_banner_title");
  const bannerSubtitle = useSetting("home_banner_subtitle");
  const bannerImage = useSetting("home_banner_image");
  const [bTitle, setBTitle] = useState("");
  const [bSub, setBSub] = useState("");
  const [bImg, setBImg] = useState("");
  const [savingBanner, setSavingBanner] = useState(false);
  useEffect(() => { setBTitle(bannerTitle ?? ""); }, [bannerTitle]);
  useEffect(() => { setBSub(bannerSubtitle ?? ""); }, [bannerSubtitle]);
  useEffect(() => { setBImg(bannerImage ?? ""); }, [bannerImage]);

  const toggleBanner = async (v: boolean) => {
    try {
      await setSetting("home_banner_visible", v ? "true" : "false");
      qc.invalidateQueries({ queryKey: ["settings", "home_banner_visible"] });
      toast.success(v ? "Banner visível" : "Banner oculto");
    } catch (e: any) { toast.error(e.message); }
  };

  const saveBanner = async () => {
    setSavingBanner(true);
    try {
      await Promise.all([
        setSetting("home_banner_title", bTitle),
        setSetting("home_banner_subtitle", bSub),
        setSetting("home_banner_image", bImg),
      ]);
      ["home_banner_title","home_banner_subtitle","home_banner_image"].forEach(k =>
        qc.invalidateQueries({ queryKey: ["settings", k] })
      );
      toast.success("Banner salvo");
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingBanner(false); }
  };

  const uploadBanner = async (file: File) => {
    setSavingBanner(true);
    try {
      const path = `banner-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed?.signedUrl) setBImg(signed.signedUrl);
      toast.success("Imagem carregada — clique em Salvar");
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingBanner(false); }
  };

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [products, orders, recebidos, erros, pendingReqs] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "recebido"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "erro_integracao"),
        supabase.from("admin_access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return {
        products: products.count ?? 0,
        orders: orders.count ?? 0,
        recebidos: recebidos.count ?? 0,
        erros: erros.count ?? 0,
        pendingReqs: pendingReqs.count ?? 0,
      };
    },
  });

  const togglePrices = async (checked: boolean) => {
    setSaving(true);
    try {
      await setCatalogShowPrices(checked);
      await qc.invalidateQueries({ queryKey: ["settings", "catalog_show_prices"] });
      toast.success(checked ? "Preços visíveis para clientes" : "Preços ocultos — clientes verão 'Sob consulta'");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    { label: "Produtos ativos", value: stats?.products ?? 0, icon: Package, color: "text-primary bg-primary/10" },
    { label: "Total de pedidos", value: stats?.orders ?? 0, icon: ShoppingBag, color: "text-success bg-success/10" },
    { label: "Pedidos recebidos", value: stats?.recebidos ?? 0, icon: Inbox, color: "text-warning bg-warning/10" },
    { label: "Erros de integração", value: stats?.erros ?? 0, icon: AlertCircle, color: "text-destructive bg-destructive/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do portal</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`grid h-12 w-12 place-items-center rounded-lg ${c.color}`}>
                <c.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 flex items-center gap-4 flex-wrap">
          <div className={`grid h-12 w-12 place-items-center rounded-lg ${showPrices ? "text-success bg-success/10" : "text-muted-foreground bg-muted"}`}>
            {showPrices ? <Eye className="h-6 w-6" /> : <EyeOff className="h-6 w-6" />}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold">Exibir preços no catálogo público</div>
            <p className="text-sm text-muted-foreground">
              Quando desligado, todos os visitantes veem <strong>"Sob consulta"</strong> em vez do valor. Ideal quando você prefere responder com orçamento personalizado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Label htmlFor="show-prices" className="text-sm">{showPrices ? "Visíveis" : "Ocultos"}</Label>
            <Switch id="show-prices" checked={showPrices} onCheckedChange={togglePrices} disabled={saving} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className={`grid h-12 w-12 place-items-center rounded-lg ${bannerVisible ? "text-primary bg-primary/10" : "text-muted-foreground bg-muted"}`}>
              <ImageIcon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold">Banner da página inicial</div>
              <p className="text-sm text-muted-foreground">Exibe uma faixa promocional no topo da home. Configure título, subtítulo e imagem.</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="banner-visible" className="text-sm">{bannerVisible ? "Visível" : "Oculto"}</Label>
              <Switch id="banner-visible" checked={bannerVisible} onCheckedChange={toggleBanner} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Título</Label>
              <Input value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder="Ex: Promoção de Toners" />
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Input value={bSub} onChange={(e) => setBSub(e.target.value)} placeholder="Ex: Até 30% OFF em toda a linha HP" />
            </div>
            <div className="sm:col-span-2">
              <Label>Imagem (URL)</Label>
              <div className="flex gap-2">
                <Input value={bImg} onChange={(e) => setBImg(e.target.value)} placeholder="https://... ou faça upload" />
                <label>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
                  <Button type="button" variant="outline" asChild><span>Upload</span></Button>
                </label>
              </div>
              {bImg && <img src={bImg} alt="banner" className="mt-2 max-h-32 rounded border" />}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveBanner} disabled={savingBanner}>
              {savingBanner && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar banner
            </Button>
          </div>
        </CardContent>
      </Card>

      {(stats?.pendingReqs ?? 0) > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 text-sm">
            📬 Você tem <strong>{stats?.pendingReqs}</strong> solicitação(ões) de acesso administrativo pendente(s). Acesse <a href="/admin/administradores" className="text-primary underline">Administradores</a>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
