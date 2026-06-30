import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PriceVisibilityState {
  showPrices: boolean;
  toggle: () => void;
  setShow: (show: boolean) => void;
}

export const usePriceVisibility = create<PriceVisibilityState>()(
  persist(
    (set) => ({
      showPrices: true,
      toggle: () => set((s) => ({ showPrices: !s.showPrices })),
      setShow: (show) => set({ showPrices: show }),
    }),
    { name: "novaprint-price-visibility" }
  )
);
