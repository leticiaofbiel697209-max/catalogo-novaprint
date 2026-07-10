import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const LEGACY_BULK_LABEL = "Gerar descrições com IA";
const BULK_LABEL = "Gerar descrições automáticas";
const LEGACY_ROW_TITLE = "Gerar descrição com IA";
const ROW_TITLE = "Gerar descrição automática";
const BATCH_SIZE = 500;

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

const isLegacyCreditsError = (message: string) =>
  /\b402\b|not enough credits|payment_required/i.test(message);

const updateVisibleLabels = () => {
  document.querySelectorAll<HTMLElement>("button").forEach((button) => {
    const text = button.textContent?.replace(/\s+/g, " ").trim();
    if (text === LEGACY_BULK_LABEL) {
      const textNode = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ` ${BULK_LABEL}`;
      else button.append(` ${BULK_LABEL}`);
      button.dataset.descriptionGenerator = "bulk";
    }
  });

  document.querySelectorAll<HTMLElement>(`[title="${LEGACY_ROW_TITLE}"]`).forEach((element) => {
    element.setAttribute("title", ROW_TITLE);
  });
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
      if (!window.confirm("Gerar automaticamente as descrições de todos os produtos sem descrição? O processo usa regras locais e não consome créditos de IA.")) return;

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
        let attempts = 0;
        const maxAttempts = Math.ceil(total / BATCH_SIZE) + 5;

        while (remaining > 0 && attempts < maxAttempts) {
          attempts += 1;
          button.textContent = `Gerando ${processed}/${total}`;

          const { data, error } = await supabase.functions.invoke("generate-product-descriptions", {
            body: { limit: BATCH_SIZE },
          });

          if (error) {
            const message = normalizeError(error);
            if (isLegacyCreditsError(message)) {
              throw new Error("A Edge Function publicada ainda é a versão antiga que usa créditos. Republique generate-product-descriptions no Supabase/Lovable e tente novamente.");
            }
            throw error;
          }

          const firstError = data?.errors?.[0]?.error ? String(data.errors[0].error) : "";
          if (firstError && isLegacyCreditsError(firstError)) {
            throw new Error("A Edge Function publicada ainda é a versão antiga que usa créditos. Republique generate-product-descriptions no Supabase/Lovable e tente novamente.");
          }

          const updated = Number(data?.updated ?? 0);
          if (!Number.isFinite(updated) || updated <= 0) {
            if (remaining > 0) {
              toast.warning(`Processo interrompido após ${processed} descrição(ões): o último lote não atualizou nenhum produto.`);
            }
            break;
          }

          processed += updated;
          remaining = await getMissingDescriptionCount();
          button.textContent = `Gerando ${Math.min(processed, total)}/${total}`;
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["admin-products"] }),
          queryClient.invalidateQueries({ queryKey: ["admin-products-counts"] }),
        ]);

        if (remaining === 0) {
          toast.success(`${processed} descrição(ões) gerada(s) automaticamente.`);
        } else if (attempts >= maxAttempts) {
          toast.warning(`${processed} descrição(ões) gerada(s). O processo foi interrompido por segurança; ainda restam ${remaining}.`);
        }
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
