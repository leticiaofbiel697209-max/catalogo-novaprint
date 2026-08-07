import { describe, expect, it } from "vitest";
import { normalizeHeader, parseDelimitedText, parseMoney } from "@/services/gestaoClickProductImport";

describe("GestãoClick product import helpers", () => {
  it("normalizes accented and spaced headers", () => {
    expect(normalizeHeader("Preço de Venda")).toBe("precodevenda");
    expect(normalizeHeader("Código/SKU")).toBe("codigosku");
  });

  it("parses Brazilian currency values", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("99,90")).toBe(99.9);
    expect(parseMoney(10)).toBe(10);
  });

  it("parses semicolon CSV and quoted fields", () => {
    const rows = parseDelimitedText('Código;Nome;Preço\n123;"Toner HP, preto";R$ 99,90');
    expect(rows).toEqual([
      ["Código", "Nome", "Preço"],
      ["123", "Toner HP, preto", "R$ 99,90"],
    ]);
  });

  it("parses tab separated exports", () => {
    const rows = parseDelimitedText("Código\tNome\tEstoque\nABC\tPapel A4\t20");
    expect(rows[1]).toEqual(["ABC", "Papel A4", "20"]);
  });
});
