import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const KEY = ["settings", "catalog_show_prices"] as const;

export function useCatalogShowPrices() {
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "catalog_show_prices")
        .maybeSingle();
      return (data?.value ?? "true") === "true";
    },
    staleTime: 60_000,
  });
  return data ?? true;
}

export function useInvalidateCatalogShowPrices() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export async function setCatalogShowPrices(show: boolean) {
  const { data: existing } = await supabase
    .from("settings").select("id").eq("key", "catalog_show_prices").maybeSingle();
  if (existing) {
    const { error } = await supabase.from("settings").update({ value: show ? "true" : "false" }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("settings").insert({ key: "catalog_show_prices", value: show ? "true" : "false" });
    if (error) throw error;
  }
}
