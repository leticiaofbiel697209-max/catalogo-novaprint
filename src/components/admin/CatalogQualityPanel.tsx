import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ImageOff, ShieldAlert, Tags, WandSparkles, FileWarning, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function CatalogQualityPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-quality"],
    queryFn: async () => {
      const [noImage, imageReview, noCategory, categoryReview, noDescription] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).or("image_url.is.null,image_url.eq."),
        supabase.from("products").select("id", { count: "exact", head: true }).in("image_review_status", ["suspect", "pending"]),
        supabase.from("products").select("id", { count: "exact", head: true }).is("category_id", null),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("category_review_status", "suggested"),
        supabase.from("products").select("id", { count: "exact", head: true }).or("description.is.null,description.eq."),
      ]);
      return {
        noImage: noImage.count ?? 0,
        imageReview: imageReview.count ?? 0,
        noCategory: noCategory.count ?? 0,
        categoryReview: categoryReview.count ?? 0,
        noDescription: noDescription.count ?? 0,
      };
    },
  });

  const items = [
    { label: "Sem imagem", value: data?.noImage ?? 0, icon: ImageOff, to: "/admin/produtos", hint: "Preencher imagens" },
    { label: "Imagens para revisar", value: data?.imageReview ?? 0, icon: ShieldAlert, to: "/admin/revisao-imagens", hint: "Revisar imagens" },
    { label: "Sem categoria", value: data?.noCategory ?? 0, icon: Tags, to: "/admin/categorias", hint: "Gerar sugestões" },
    { label: "Categorias para revisar", value: data?.categoryReview ?? 0, icon: WandSparkles, to: "/admin/categorias", hint: "Aprovar sugestões" },
    { label: "Sem descrição", value: data?.noDescription ?? 0, icon: FileWarning, to: "/admin/produtos", hint: "Completar descrições" },
  ];

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <div className="font-semibold text-lg">Qualidade do catálogo</div>
          <p className="text-sm text-muted-foreground">Pendências que afetam a apresentação e a organização dos produtos.</p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {items.map((item) => (
            <Link key={item.label} to={item.to} className="rounded-lg border p-3 hover:bg-accent transition-colors group">
              <div className="flex items-center justify-between gap-2">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </div>
              <div className="text-2xl font-bold mt-2">{isLoading ? "—" : item.value}</div>
              <div className="text-xs font-medium">{item.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{item.hint}</div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
