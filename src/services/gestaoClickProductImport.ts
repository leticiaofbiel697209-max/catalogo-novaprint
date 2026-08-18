import { supabase } from "@/integrations/supabase/client";

export const normalizeHeader = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const parseMoney = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export const parseInteger = (value: unknown) => {
  const n = parseMoney(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

export function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseDelimitedText(text: string) {
  const cleanText = text.replace(/^\uFEFF/, "");
  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  const delimiter = [";", ",", "\t"]
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate;

  return lines.map((line) => parseCsvLine(line, delimiter));
}

export function parseHtmlTable(text: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  return Array.from(doc.querySelectorAll("table tr"))
    .map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? ""))
    .filter((row) => row.some(Boolean));
}

export function getCell(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key] !== undefined && String(row[key]).trim() !== "") return String(row[key]).trim();
  }
  return "";
}

export interface ImportCategory {
  id: string;
  name: string;
}

export async function importGestaoClickProductSheet(file: File, categories: ImportCategory[]) {
  const text = await file.text();
  const isHtml = /<table|<html|<tr|<td/i.test(text);
  const rows = isHtml ? parseHtmlTable(text) : parseDelimitedText(text);
  if (rows.length < 2) {
    throw new Error("Não consegui ler a planilha. Exporte do GestãoClick em CSV ou Excel .xls/HTML e tente novamente.");
  }

  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => { record[header] = cells[index] ?? ""; });
    return record;
  });

  const categoryCache = new Map<string, string>();
  categories.forEach((category) => categoryCache.set(normalizeHeader(category.name), category.id));

  let imported = 0;
  let skipped = 0;
  let costsUpdated = 0;

  for (const record of records) {
    const name = getCell(record, ["Nome", "Produto", "Descrição", "Descricao", "Nome do produto", "Produto/Serviço", "Produto Serviço"]);
    const code = getCell(record, ["Código", "Codigo", "Cod", "SKU", "Referência", "Referencia", "ID", "Nº", "Numero"]);
    const brand = getCell(record, ["Marca", "Fabricante"]);
    const categoryName = getCell(record, ["Categoria", "Grupo", "Departamento", "Família", "Familia"]);
    const description = getCell(record, ["Descrição detalhada", "Descricao detalhada", "Observação", "Observacao", "Detalhes"]);
    const imageUrl = getCell(record, ["Imagem", "URL imagem", "Image URL", "Foto", "URL"]);
    const price = parseMoney(getCell(record, ["Preço", "Preco", "Preço venda", "Preco venda", "Valor", "Valor venda", "Venda"]));
    const costPrice = parseMoney(getCell(record, ["Custo", "Preço custo", "Preco custo", "Valor custo", "Custo médio", "Custo medio"]));
    const stock = parseInteger(getCell(record, ["Estoque", "Saldo", "Quantidade", "Qtd", "Disponível", "Disponivel"]));

    if (!name) {
      skipped += 1;
      continue;
    }

    let categoryId: string | null = null;
    if (categoryName) {
      const normalizedCategory = normalizeHeader(categoryName);
      categoryId = categoryCache.get(normalizedCategory) ?? null;
      if (!categoryId) {
        const { data: newCategory, error: categoryError } = await supabase
          .from("categories")
          .insert({ name: categoryName })
          .select("id")
          .single();
        if (categoryError) throw categoryError;
        categoryId = newCategory.id;
        categoryCache.set(normalizedCategory, categoryId);
      }
    }

    const payload = {
      name,
      code: code || null,
      brand: brand || null,
      category_id: categoryId,
      description: description || null,
      price,
      stock,
      image_url: imageUrl || null,
      image_review_status: imageUrl ? "suspect" : "approved",
      image_source_url: imageUrl || null,
      image_review_note: imageUrl ? "Imagem importada da planilha — revisar antes de aprovar" : null,
      active: true,
    };

    let productId: string | null = null;
    if (code) {
      const { data, error } = await supabase.from("products").upsert(payload, { onConflict: "code" }).select("id").single();
      if (error) throw error;
      productId = data.id;
    } else {
      const { data: existing } = await supabase.from("products").select("id").eq("name", name).maybeSingle();
      const { data, error } = existing?.id
        ? await supabase.from("products").update(payload).eq("id", existing.id).select("id").single()
        : await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      productId = data.id;
    }

    if (productId && costPrice > 0) {
      const { error: costError } = await supabase
        .from("product_costs")
        .upsert({ product_id: productId, cost_price: costPrice }, { onConflict: "product_id" });
      if (costError) throw costError;
      costsUpdated += 1;
    }

    imported += 1;
  }

  return { imported, skipped, costsUpdated };
}
