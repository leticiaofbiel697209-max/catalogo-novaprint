-- Refina a arvore de categorias para catalogo de suprimentos de impressao.
-- A migracao preserva categorias existentes e so cria/renomeia grupos conhecidos.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE name = 'Papel')
     AND NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Papeis e Midias') THEN
    UPDATE public.categories
      SET name = 'Papeis e Midias',
          description = 'Papeis, midias fotograficas, adesivos e materiais para impressao'
      WHERE name = 'Papel';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE name = 'Cartuchos')
     AND NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Cartuchos de Tinta') THEN
    UPDATE public.categories
      SET name = 'Cartuchos de Tinta',
          description = 'Cartuchos originais e compativeis para impressoras jato de tinta'
      WHERE name = 'Cartuchos';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE name = 'Impressoras')
     AND NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Impressoras e Multifuncionais') THEN
    UPDATE public.categories
      SET name = 'Impressoras e Multifuncionais',
          description = 'Impressoras, multifuncionais, scanners e equipamentos de impressao'
      WHERE name = 'Impressoras';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE name = 'Suprimentos')
     AND NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Suprimentos Gerais') THEN
    UPDATE public.categories
      SET name = 'Suprimentos Gerais',
          description = 'Itens gerais de escritorio e apoio ao catalogo'
      WHERE name = 'Suprimentos';
  END IF;
END $$;

INSERT INTO public.categories (name, description, active)
SELECT name, description, true
FROM (VALUES
  ('Toners', 'Toners originais e compativeis para impressoras laser'),
  ('Cartuchos de Tinta', 'Cartuchos originais e compativeis para impressoras jato de tinta'),
  ('Tintas e Refis', 'Garrafas, refis e tintas para impressoras tanque de tinta'),
  ('Cilindros e Fotocondutores', 'Cilindros, drums, fotocondutores e unidades de imagem'),
  ('Pecas e Manutencao', 'Fusores, rolos, kits de manutencao e pecas de reposicao'),
  ('Papeis e Midias', 'Papeis, midias fotograficas, adesivos e materiais para impressao'),
  ('Etiquetas e Bobinas', 'Etiquetas, bobinas, ribbons e suprimentos termicos'),
  ('Impressoras e Multifuncionais', 'Impressoras, multifuncionais, scanners e equipamentos de impressao'),
  ('Informatica e Acessorios', 'Cabos, perifericos, rede, energia e acessorios de informatica'),
  ('Material de Escritorio', 'Canetas, pastas, grampeadores e itens de escritorio'),
  ('Suprimentos Gerais', 'Itens gerais de escritorio e apoio ao catalogo')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE lower(c.name) = lower(v.name)
);

WITH matched AS (
  SELECT
    p.id,
    CASE
      WHEN p.name ~* '(cilindro|fotocondutor|drum|unidade de imagem|imaging unit)' THEN 'Cilindros e Fotocondutores'
      WHEN p.name ~* '(fusor|rolo|pickup|separador|transfer|kit manutencao|kit manutenção|peca|peça)' THEN 'Pecas e Manutencao'
      WHEN p.name ~* 'toner' THEN 'Toners'
      WHEN p.name ~* 'cartucho' THEN 'Cartuchos de Tinta'
      WHEN p.name ~* '(tinta|refil|garrafa)' THEN 'Tintas e Refis'
      WHEN p.name ~* '(etiqueta|bobina|ribbon|termica|térmica)' THEN 'Etiquetas e Bobinas'
      WHEN p.name ~* '(papel|sulfite|fotografico|fotográfico|couche|couchê|adesivo|glossy|a4|a3)' THEN 'Papeis e Midias'
      WHEN p.name ~* '(impressora|multifuncional|plotter|scanner)' THEN 'Impressoras e Multifuncionais'
      WHEN p.name ~* '(mouse|teclado|cabo|hdmi|usb|roteador|headset|fone|webcam|nobreak|estabilizador)' THEN 'Informatica e Acessorios'
      WHEN p.name ~* '(caneta|lapis|lápis|grampeador|clips|pasta|envelope|caderno|agenda)' THEN 'Material de Escritorio'
      ELSE NULL
    END AS category_name
  FROM public.products p
)
UPDATE public.products p
SET category_id = c.id
FROM matched m
JOIN public.categories c ON c.name = m.category_name
LEFT JOIN public.categories current_c ON current_c.id = p.category_id
WHERE p.id = m.id
  AND m.category_name IS NOT NULL
  AND (
    p.category_id IS NULL
    OR current_c.name IN ('Suprimentos', 'Suprimentos Gerais', 'Papel', 'Cartuchos', 'Impressoras')
  );
