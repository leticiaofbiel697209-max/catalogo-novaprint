import { supabase } from "@/integrations/supabase/client";

export async function fetchActiveCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function searchActiveProducts(searchTerm: string, categoryId: string | null) {
  let query = supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("name");

  if (categoryId) query = query.eq("category_id", categoryId);

  if (searchTerm) {
    const terms = searchTerm.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const term of terms) {
      const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
      query = query.or(
        `name.ilike.${like},code.ilike.${like},brand.ilike.${like},description.ilike.${like}`,
      );
    }
  }

  const { data, error } = await query.limit(500);
  if (error) throw error;
  return data ?? [];
}
