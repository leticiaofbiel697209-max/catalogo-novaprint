-- Preenche somente descrições vazias ou nulas.
-- Não altera nome, código, preço, estoque, categoria, imagem ou visibilidade.

update public.products as p
set description = trim(
  concat_ws(
    ' ',
    p.name || '.',
    case
      when nullif(trim(coalesce(p.brand, '')), '') is not null
        then 'Produto da marca ' || trim(p.brand) || '.'
      else null
    end,
    case
      when c.name is not null and trim(c.name) <> ''
        then 'Categoria: ' || trim(c.name) || '.'
      else null
    end,
    case
      when nullif(trim(coalesce(p.code, '')), '') is not null
        then 'Código: ' || trim(p.code) || '.'
      else null
    end
  )
)
from public.categories as c
where p.category_id = c.id
  and nullif(trim(coalesce(p.description, '')), '') is null;

-- Também cobre produtos sem categoria.
update public.products as p
set description = trim(
  concat_ws(
    ' ',
    p.name || '.',
    case
      when nullif(trim(coalesce(p.brand, '')), '') is not null
        then 'Produto da marca ' || trim(p.brand) || '.'
      else null
    end,
    case
      when nullif(trim(coalesce(p.code, '')), '') is not null
        then 'Código: ' || trim(p.code) || '.'
      else null
    end
  )
)
where p.category_id is null
  and nullif(trim(coalesce(p.description, '')), '') is null;
