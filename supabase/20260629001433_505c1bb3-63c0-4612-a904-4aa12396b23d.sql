
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- Seed categories
INSERT INTO public.categories (name, description) VALUES
  ('Toners', 'Toners originais e compatíveis para impressoras laser'),
  ('Cartuchos', 'Cartuchos de tinta para impressoras jato de tinta'),
  ('Papel', 'Papéis especiais e sulfite para impressão'),
  ('Etiquetas', 'Etiquetas adesivas e térmicas'),
  ('Impressoras', 'Impressoras laser, jato de tinta e multifuncionais'),
  ('Suprimentos', 'Suprimentos gerais para escritório');

-- Seed products
WITH c AS (SELECT id, name FROM public.categories)
INSERT INTO public.products (name, code, brand, category_id, description, price, stock, image_url, featured, active)
VALUES
  ('Toner HP CF283A 83A Preto', 'TN-83A', 'HP', (SELECT id FROM c WHERE name='Toners'),
   'Toner original HP 83A, rendimento 1.500 páginas. Compatível com LaserJet Pro M125/M127.', 389.90, 24,
   'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=800', true, true),
  ('Toner Brother TN-1060 Preto', 'TN-1060', 'Brother', (SELECT id FROM c WHERE name='Toners'),
   'Toner original Brother TN-1060, rendimento 1.000 páginas.', 279.00, 18,
   'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800', true, true),
  ('Cartucho HP 664 Tricolor', 'CT-664TR', 'HP', (SELECT id FROM c WHERE name='Cartuchos'),
   'Cartucho de tinta original HP 664 colorido. Ideal para impressoras DeskJet.', 119.90, 40,
   'https://images.unsplash.com/photo-1563770660941-20978e870e26?w=800', true, true),
  ('Cartucho Epson 664 Preto', 'CT-664PT', 'Epson', (SELECT id FROM c WHERE name='Cartuchos'),
   'Refil de tinta Epson 664 preto, 70ml. Para EcoTank L355, L365, L375.', 49.90, 80,
   'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=800', false, true),
  ('Papel Sulfite A4 75g Chamex 500fls', 'PP-A4-CHX', 'Chamex', (SELECT id FROM c WHERE name='Papel'),
   'Resma com 500 folhas de papel sulfite A4 75g, branco alta alvura.', 32.50, 200,
   'https://images.unsplash.com/photo-1568667256549-094345857637?w=800', true, true),
  ('Papel Fotográfico A4 180g 50fls', 'PP-FT-180', 'Masterprint', (SELECT id FROM c WHERE name='Papel'),
   'Papel fotográfico glossy 180g, pacote com 50 folhas A4.', 45.00, 60,
   'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800', false, true),
  ('Etiqueta Térmica 100x50 Rolo 1000un', 'ET-T-100x50', 'Pimaco', (SELECT id FROM c WHERE name='Etiquetas'),
   'Rolo de etiquetas térmicas adesivas 100x50mm, 1.000 unidades.', 38.90, 120,
   'https://images.unsplash.com/photo-1611242320536-f12d3541249b?w=800', false, true),
  ('Impressora HP LaserJet M111w Wi-Fi', 'IMP-M111W', 'HP', (SELECT id FROM c WHERE name='Impressoras'),
   'Impressora laser monocromática HP LaserJet M111w com Wi-Fi, 21 ppm.', 1490.00, 8,
   'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=800', true, true),
  ('Multifuncional Epson L3250 EcoTank', 'IMP-L3250', 'Epson', (SELECT id FROM c WHERE name='Impressoras'),
   'Multifuncional tanque de tinta colorida com Wi-Fi e impressão direta pelo celular.', 1390.00, 6,
   'https://images.unsplash.com/photo-1563770660941-20978e870e26?w=800', false, true),
  ('Caneta Esferográfica Azul Cx 50un', 'SP-CN-AZ', 'BIC', (SELECT id FROM c WHERE name='Suprimentos'),
   'Caixa com 50 canetas esferográficas azuis, ponta média 1.0mm.', 79.90, 35,
   'https://images.unsplash.com/photo-1583485088034-697b5bc36b92?w=800', false, true);
