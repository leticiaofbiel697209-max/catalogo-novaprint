import { supabase } from "@/integrations/supabase/client";

export interface SubmitOrderCustomer {
  name: string;
  company: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SubmitOrderItem {
  product_id: string;
  quantity: number;
}

export interface SubmitOrderPayload {
  customer: SubmitOrderCustomer;
  items: SubmitOrderItem[];
  notes?: string | null;
}

export async function submitOrder(payload: SubmitOrderPayload): Promise<string> {
  const { data, error } = await supabase.functions.invoke("submit-order", { body: payload });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.order_id) throw new Error("Pedido criado sem identificador de confirmação");

  return data.order_id as string;
}
