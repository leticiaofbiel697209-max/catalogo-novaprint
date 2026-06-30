import { formatBRL } from "@/lib/format";
import { usePriceVisibility } from "@/store/priceVisibility";

interface PriceDisplayProps {
  value: number;
  className?: string;
}

export default function PriceDisplay({ value, className = "" }: PriceDisplayProps) {
  const showPrices = usePriceVisibility((s) => s.showPrices);
  if (!showPrices) {
    return <span className={`text-muted-foreground italic ${className}`}>Sob consulta</span>;
  }
  return <span className={className}>{formatBRL(value)}</span>;
}
