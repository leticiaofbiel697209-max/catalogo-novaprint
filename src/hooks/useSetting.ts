import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSetting(key: string) {
  const { data } = useQuery({
    queryKey: ["settings", key],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
      return data?.value ?? null;
    },
    staleTime: 30_000,
  });
  return data ?? null;
}

export function useInvalidateSetting() {
  const qc = useQueryClient();
  return (key: string) => qc.invalidateQueries({ queryKey: ["settings", key] });
}

export async function setSetting(key: string, value: string) {
  const { data: existing } = await supabase.from("settings").select("id").eq("key", key).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("settings").update({ value }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("settings").insert({ key, value });
    if (error) throw error;
  }
}
