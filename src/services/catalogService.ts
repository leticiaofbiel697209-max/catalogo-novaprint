import { supabase } from "@/integrations/supabase/client";

const SEARCH_SYNONYMS: Record<string, string[]> = {
  tambor: ["cilindro", "fotocondutor", "drum"],
  cilindro: ["tambor", "fotocondutor", "drum"],
  fotocondutor: ["tambor", "cilindro", "drum"],
  drum: ["tambor", "cilindro", "fotocondutor"],
};

function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function expandSearchVariants(term: string) {
  return [term, ...(SEARCH_SYNONYMS[normalizeTerm(term)] ?? [])];
}

export async function fetchActiveCategories() {
  const { data, error } = await (supabase as any).rpc("public_categories_with_products");

  if (error) throw error;
  return (data ?? []) as { id: string; name: string; product_count: number }[];
}

export async function searchActiveProductsPage(
  searchTerm: string,
  categoryId: string | null,
  page: number,
  pageSize = 48,
) {
  const safePage = Math.max(0, page);
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const from = safePage * safePageSize;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("active", true)
    .order("name")
    .order("id");

  if (categoryId) query = query.eq("category_id", categoryId);

  if (searchTerm) {
    const terms = searchTerm.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const term of terms) {
      const filters = expandSearchVariants(term).flatMap((variant) => {
        const like = `%${variant.replace(/[%_]/g, "\\$&")}%`;
        return [
          `name.ilike.${like}`,
          `code.ilike.${like}`,
          `brand.ilike.${like}`,
          `description.ilike.${like}`,
        ];
      });
      query = query.or(filters.join(","));
    }
  }

  const { data, error, count } = await query.range(from, from + safePageSize - 1);
  if (error) throw error;

  return {
    items: data ?? [],
    count: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

// Mantido por compatibilidade com chamadas antigas. Novas telas devem preferir a versão paginada.
export async function searchActiveProducts(searchTerm: string, categoryId: string | null) {
  const page = await searchActiveProductsPage(searchTerm, categoryId, 0, 100);
  return page.items;
}
