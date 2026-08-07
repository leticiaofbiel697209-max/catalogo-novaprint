import { supabase } from "@/integrations/supabase/client";

export type ImageReviewStatus = "approved" | "suspect" | "pending";

export interface AdminProductFilters {
  search?: string;
  categoryId?: string;
  missingFilter?: string;
  limit?: number;
}

export interface ProductPayload {
  name: string;
  code: string | null;
  brand: string | null;
  category_id: string | null;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  image_review_status: ImageReviewStatus;
  image_review_note: string | null;
  featured: boolean;
  active: boolean;
}

const normalizeSearchTerm = (value: string) =>
  value
    .trim()
    .replace(/[,()]/g, " ")
    .replace(/[%_]/g, "\\$&")
    .replace(/\s+/g, " ");

export async function fetchAdminProducts({
  search = "",
  categoryId = "all",
  missingFilter = "all",
  limit = 500,
}: AdminProductFilters) {
  let query = supabase
    .from("products")
    .select("*, categories(name), product_costs(cost_price)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (categoryId !== "all") query = query.eq("category_id", categoryId);
  if (missingFilter === "no_image") query = query.or("image_url.is.null,image_url.eq.");
  if (missingFilter === "no_description") query = query.or("description.is.null,description.eq.");
  if (missingFilter === "no_both") {
    query = query
      .or("image_url.is.null,image_url.eq.")
      .or("description.is.null,description.eq.");
  }
  if (missingFilter === "no_any") {
    query = query.or("image_url.is.null,image_url.eq.,description.is.null,description.eq.");
  }
  if (missingFilter === "suspicious_images") {
    query = query
      .in("image_review_status", ["suspect", "pending"])
      .not("image_url", "is", null);
  }

  if (search) {
    const terms = [search, ...search.split(/\s+/)]
      .map(normalizeSearchTerm)
      .filter(Boolean)
      .slice(0, 8);
    const filters = terms.flatMap((term) => {
      const like = `%${term}%`;
      return [
        `name.ilike.${like}`,
        `code.ilike.${like}`,
        `brand.ilike.${like}`,
        `description.ilike.${like}`,
      ];
    });
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAdminProductCounts() {
  const [total, noImg, noDesc, both, suspicious] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).is("image_url", null),
    supabase.from("products").select("id", { count: "exact", head: true }).or("description.is.null,description.eq."),
    supabase.from("products").select("id", { count: "exact", head: true }).or("image_url.is.null,image_url.eq.").or("description.is.null,description.eq."),
    supabase.from("products").select("id", { count: "exact", head: true }).in("image_review_status", ["suspect", "pending"]).not("image_url", "is", null),
  ]);

  const firstError = [total.error, noImg.error, noDesc.error, both.error, suspicious.error].find(Boolean);
  if (firstError) throw firstError;

  return {
    total: total.count ?? 0,
    noImg: noImg.count ?? 0,
    noDesc: noDesc.count ?? 0,
    both: both.count ?? 0,
    suspicious: suspicious.count ?? 0,
  };
}

export async function fetchAdminCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function hideProductsWithoutImage() {
  const { data, error } = await supabase
    .from("products")
    .update({ active: false })
    .or("image_url.is.null,image_url.eq.")
    .eq("active", true)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function updateProductImageReview(id: string, status: ImageReviewStatus) {
  const { error } = await supabase
    .from("products")
    .update({
      image_review_status: status,
      image_review_note: status === "approved" ? null : "Marcada manualmente para revisão",
    })
    .eq("id", id);
  if (error) throw error;
}

export async function invokeAdminProductFunction(name: string, body: unknown) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

export async function saveProduct(
  id: string | undefined,
  payload: ProductPayload,
  costPrice: number,
) {
  const { error, data } = id
    ? await supabase.from("products").update(payload).eq("id", id).select("id").single()
    : await supabase.from("products").insert(payload).select("id").single();
  if (error) throw error;

  const productId = data?.id ?? id;
  if (productId) {
    const { error: costError } = await supabase
      .from("product_costs")
      .upsert({ product_id: productId, cost_price: costPrice }, { onConflict: "product_id" });
    if (costError) throw costError;
  }

  return productId;
}

export async function uploadProductImage(file: File) {
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}
