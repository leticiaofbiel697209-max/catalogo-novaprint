import { formatBRL } from "@/lib/format";
import { useCatalogShowPrices } from "@/hooks/useCatalogPriceVisibility";

interface PriceDisplayProps {
  value: number;
  className?: string;
}

export default function PriceDisplay({ value, className = "" }: PriceDisplayProps) {
  const showPrices = useCatalogShowPrices();
  if (!showPrices) {
    return <span className={`text-muted-foreground italic ${className}`}>Sob consulta</span>;
  }
  return <span className={className}>{formatBRL(value)}</span>;
}
