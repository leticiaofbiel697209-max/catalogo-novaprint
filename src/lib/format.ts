export const formatBRL = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);

export const formatCNPJ = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

export const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

export const statusLabel: Record<string, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  enviado_ao_gestaoclick: "Enviado ao GestãoClick",
  concluido: "Concluído",
  cancelado: "Cancelado",
  erro_integracao: "Erro de integração",
};

export const statusColor: Record<string, string> = {
  recebido: "bg-secondary text-secondary-foreground",
  em_analise: "bg-warning/15 text-warning border border-warning/30",
  enviado_ao_gestaoclick: "bg-primary/10 text-primary border border-primary/20",
  concluido: "bg-success/15 text-success border border-success/30",
  cancelado: "bg-muted text-muted-foreground",
  erro_integracao: "bg-destructive/15 text-destructive border border-destructive/30",
};
