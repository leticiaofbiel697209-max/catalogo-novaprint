import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, FileSpreadsheet } from "lucide-react";

type Row = {
  code: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  cost?: number | null;
  price?: number | null;
  stock?: number | null;
};

const BRANDS = ["HP", "BROTHER", "EPSON", "SAMSUNG", "LEXMARK", "CANON", "XEROX", "OKI", "RICOH", "KYOCERA", "DELL", "PANTUM", "MULTILASER", "INTELBRAS"];

function detectBrand(name: string): string | null {
  const up = name.toUpperCase();
  return BRANDS.find((b) => up.includes(b)) ?? null;
}

function detectCategory(name: string): string {
  const up = name.toUpperCase();
  if (up.includes("TONER")) return "Toners";
  if (up.includes("CARTUCHO")) return "Cartuchos";
  if (up.includes("TINTA") || up.includes("REFIL") || up.includes("GARRAFA")) return "Tintas e Refis";
  if (up.includes("CILINDRO") || up.includes("FOTOCONDUTOR") || up.includes("DRUM")) return "Cilindros e Fotocondutores";
  if (up.includes("ETIQUETA")) return "Etiquetas";
  if (up.includes("PAPEL") || up.includes("BOBINA")) return "Papel";
  if (up.includes("IMPRESSORA") || up.includes("MULTIFUNCIONAL")) return "Impressoras";
  return "Suprimentos";
}

function pickNumber(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseSheet(file: File): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
        const rows: Row[] = [];
        for (const r of json) {
          const keys = Object.keys(r);
          const get = (...names: string[]) => {
            for (const n of names) {
              const k = keys.find((kk) => kk.toLowerCase().trim() === n.toLowerCase().trim());
              if (k && r[k] != null && r[k] !== "") return r[k];
            }
            return null;
          };
          const name = get("Descrição", "Descricao", "Nome", "Produto", "name");
          if (!name) continue;
          const code = get("Cód. Interno", "Cod. Interno", "Código", "Codigo", "code", "SKU") ?? String(name).slice(0, 40);
          const cost = pickNumber(get("Preço Custo", "Preco Custo", "Custo", "cost", "Custo Unitário"));
          const total075 = pickNumber(get("Total 0,75%", "Total 075", "Total 0.75%"));
          const sellRaw = pickNumber(get("Preço Venda", "Preco Venda", "Venda", "price"));
          const stockRaw = pickNumber(get("Estoque", "Saldo", "Qtd", "Quantidade", "stock")) ?? 1;
          let price = total075 && total075 > 0 ? total075 / Math.max(1, stockRaw) : null;
          if (!price && sellRaw) price = sellRaw;
          if (!price && cost) price = cost * 1.75;
          if (!price) continue;
          rows.push({
            code: String(code).trim(),
            name: String(name).trim(),
            brand: detectBrand(String(name)),
            category: detectCategory(String(name)),
            cost: cost ?? null,
            price: Number(price.toFixed(2)),
            stock: Math.max(0, Math.round(stockRaw)),
          });
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

export default function AdminImportProducts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [autoDesc, setAutoDesc] = useState(true);
  const [autoImg, setAutoImg] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setRows([]);
    try {
      const parsed = await parseSheet(f);
      setRows(parsed);
      toast({ title: "Planilha lida", description: `${parsed.length} produto(s) prontos para importar.` });
    } catch (e: any) {
      toast({ title: "Erro ao ler", description: e.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    setProgress("Enviando produtos...");
    try {
      const { data, error } = await supabase.functions.invoke("import-products", { body: { products: rows } });
      if (error) throw error;
      toast({ title: "Importação concluída", description: `${data?.inserted ?? 0} produtos salvos.` });

      if (autoDesc) {
        setProgress("Gerando descrições com IA (pode demorar)...");
        const r = await supabase.functions.invoke("generate-product-descriptions", { body: { onlyMissing: true } });
        if (r.error) toast({ title: "Descrições", description: r.error.message, variant: "destructive" });
        else toast({ title: "Descrições", description: `${(r.data as any)?.updated ?? 0} geradas.` });
      }
      if (autoImg) {
        setProgress("Buscando imagens...");
        const r = await supabase.functions.invoke("fetch-product-images", { body: { onlyMissing: true } });
        if (r.error) toast({ title: "Imagens", description: r.error.message, variant: "destructive" });
        else toast({ title: "Imagens", description: `${(r.data as any)?.updated ?? 0} encontradas.` });
      }
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar produtos em massa</h1>
        <p className="text-muted-foreground">Suba uma planilha (.xlsx) do GestãoClick. Itens existentes são atualizados pelo código.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary transition">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{file ? file.name : "Clique para escolher arquivo .xlsx"}</span>
          <Input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoDesc} onCheckedChange={(v) => setAutoDesc(!!v)} />
            Gerar descrições com IA após importar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoImg} onCheckedChange={(v) => setAutoImg(!!v)} />
            Buscar imagens automaticamente
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleImport} disabled={!rows.length || importing || parsing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Importar {rows.length ? `(${rows.length})` : ""}
          </Button>
          {parsing && <span className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha...</span>}
          {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-3 border-b text-sm font-medium">Pré-visualização ({rows.length})</div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left">
                  <th className="p-2">Código</th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2">Marca</th>
                  <th className="p-2 text-right">Custo</th>
                  <th className="p-2 text-right">Venda</th>
                  <th className="p-2 text-right">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono text-xs">{r.code}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2">{r.brand ?? "-"}</td>
                    <td className="p-2 text-right">{r.cost?.toFixed(2) ?? "-"}</td>
                    <td className="p-2 text-right">{r.price?.toFixed(2)}</td>
                    <td className="p-2 text-right">{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <div className="p-2 text-xs text-muted-foreground text-center">Mostrando 200 de {rows.length}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
