import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const LEGACY_BULK_LABEL = "Gerar descrições com IA";
const BULK_LABEL = "Gerar descrições automáticas";
const LEGACY_ROW_TITLE = "Gerar descrição com IA";
const ROW_TITLE = "Gerar descrição automática";
const FETCH_BATCH_SIZE = 200;
const UPDATE_CONCURRENCY = 20;

type ProductRow = {
  id: string;
  name: string;
  code: string | null;
  brand: string | null;
  description: string | null;
  categories?: { name?: string | null } | null;
};

const clean = (value?: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

const sentence = (value: string) => {
  const text = clean(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const categoryText = (name: string, category: string) => {
  const source = `${name} ${category}`.toLowerCase();

  if (/toner|cartucho|cilindro|fotocondutor|tinta|refil/.test(source)) {
    return "Indicado para rotinas de impressão em escritórios, empresas e ambientes profissionais, oferecendo uma opção prática para reposição de suprimentos.";
  }
  if (/papel|etiqueta|bobina|envelope|bloco|caderno/.test(source)) {
    return "Adequado para uso administrativo, comercial e operacional, auxiliando nas atividades diárias de organização, impressão e identificação.";
  }
  if (/mouse|teclado|monitor|notebook|computador|memória|memoria|cabo|adaptador|headset|informática|informatica/.test(source)) {
    return "Desenvolvido para uso em ambientes corporativos e estações de trabalho, contribuindo para uma rotina mais organizada e produtiva.";
  }
  if (/limpeza|detergente|desinfetante|álcool|alcool|saco|papel higiênico|papel higienico/.test(source)) {
    return "Recomendado para rotinas de limpeza, conservação e abastecimento de empresas, escritórios e outros ambientes profissionais.";
  }
  if (/caneta|lápis|lapis|grampeador|grampo|pasta|arquivo|crachá|cracha|escritório|escritorio/.test(source)) {
    return "Ideal para organização e uso cotidiano em escritórios, empresas, escolas e setores administrativos.";
  }

  return "Produto indicado para uso profissional e corporativo, atendendo às necessidades do dia a dia com praticidade.";
};

const buildDescription = (product: ProductRow) => {
  const name = clean(product.name) || "Produto";
  const brand = clean(product.brand);
  const code = clean(product.code);
  const category = clean(product.categories?.name);

  const details: string[] = [];
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) details.push(`da marca ${brand}`);
  if (code && !name.toLowerCase().includes(code.toLowerCase())) details.push(`código ${code}`);
  if (category) details.push(`da categoria ${category}`);

  const intro = details.length ? `${name}, ${details.join(", ")}` : name;

  return [
    sentence(intro),
    categoryText(name, category),
    "Antes da compra, confira as informações de modelo, medida, cor ou compatibilidade indicadas no nome do produto.",
  ].join(" ");
};

const getMissingDescriptionCount = async () => {
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .or("description.is.null,description.eq.");

  if (error) throw error;
  return count ?? 0;
};

const normalizeError = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Erro desconhecido";
  }
};

const updateVisibleLabels = () => {
  document.querySelectorAll<HTMLElement>("button").forEach((button) => {
    const text = button.textContent?.replace(/\s+/g, " ").trim();
    if (text === LEGACY_BULK_LABEL || text === BULK_LABEL) {
      const textNode = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (text === LEGACY_BULK_LABEL) {
        if (textNode) textNode.textContent = ` ${BULK_LABEL}`;
        else button.append(` ${BULK_LABEL}`);
      }
      button.dataset.descriptionGenerator = "bulk";
    }
  });

  document.querySelectorAll<HTMLElement>(`[title="${LEGACY_ROW_TITLE}"]`).forEach((element) => {
    element.setAttribute("title", ROW_TITLE);
  });
};

const updateProductsLocally = async (products: ProductRow[]) => {
  let updated = 0;
  const errors: string[] = [];

  for (let index = 0; index < products.length; index += UPDATE_CONCURRENCY) {
    const group = products.slice(index, index + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      group.map(async (product) => {
        const description = buildDescription(product);
        const { error } = await supabase
          .from("products")
          .update({ description })
          .eq("id", product.id)
          .or("description.is.null,description.eq.");

        if (error) return error.message;
        return null;
      }),
    );

    results.forEach((error) => {
      if (error) errors.push(error);
      else updated += 1;
    });
  }

  return { updated, errors };
};

export default function DescriptionGeneratorController() {
  const queryClient = useQueryClient();

  useEffect(() => {
    updateVisibleLabels();

    const observer = new MutationObserver(updateVisibleLabels);
    observer.observe(document.body, { childList: true, subtree: true });

    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('button[data-description-generator="bulk"]');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.disabled) return;
      if (!window.confirm("Gerar automaticamente as descrições de todos os produtos sem descrição? O processo é local e não consome créditos de IA.")) return;

      const originalHtml = button.innerHTML;
      button.disabled = true;

      try {
        const total = await getMissingDescriptionCount();
        if (total === 0) {
          toast.success("Nenhum produto sem descrição.");
          return;
        }

        let processed = 0;
        let remaining = total;

        while (remaining > 0) {
          button.textContent = `Gerando ${processed}/${total}`;

          const { data: products, error } = await supabase
            .from("products")
            .select("id, name, code, brand, description, categories(name)")
            .or("description.is.null,description.eq.")
            .limit(FETCH_BATCH_SIZE);

          if (error) throw error;
          if (!products?.length) break;

          const result = await updateProductsLocally(products as ProductRow[]);
          if (result.errors.length) {
            throw new Error(`Falha ao salvar algumas descrições: ${result.errors[0]}`);
          }
          if (result.updated <= 0) {
            throw new Error("Nenhuma descrição foi atualizada. Verifique as permissões de edição da tabela products no Supabase.");
          }

          processed += result.updated;
          remaining = await getMissingDescriptionCount();
          button.textContent = `Gerando ${Math.min(processed, total)}/${total}`;
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["admin-products"] }),
          queryClient.invalidateQueries({ queryKey: ["admin-products-counts"] }),
        ]);

        toast.success(`${processed} descrição(ões) gerada(s) automaticamente, sem uso de IA.`);
      } catch (error) {
        toast.error(normalizeError(error));
      } finally {
        button.innerHTML = originalHtml;
        button.disabled = false;
        window.setTimeout(updateVisibleLabels, 0);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, [queryClient]);

  return null;
}
