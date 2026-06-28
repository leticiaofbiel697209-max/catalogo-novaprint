import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  product_id: string;
  name: string;
  code: string | null;
  price: number;
  image_url: string | null;
  quantity: number;
  stock: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  remove: (product_id: string) => void;
  setQty: (product_id: string, qty: number) => void;
  clear: () => void;
  count: () => number;
  total: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item, qty = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.product_id === item.product_id);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.product_id === item.product_id ? { ...i, quantity: i.quantity + qty } : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, quantity: qty }] };
        }),
      remove: (product_id) => set((s) => ({ items: s.items.filter((i) => i.product_id !== product_id) })),
      setQty: (product_id, qty) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.product_id === product_id ? { ...i, quantity: Math.max(1, qty) } : i))
            .filter((i) => i.quantity > 0),
        })),
      clear: () => set({ items: [] }),
      count: () => get().items.reduce((a, i) => a + i.quantity, 0),
      total: () => get().items.reduce((a, i) => a + i.quantity * i.price, 0),
    }),
    { name: "novaprint-cart" },
  ),
);
