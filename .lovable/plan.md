## Portal de Pedidos NovaPrint

Vou construir um portal web completo para clientes da NovaPrint montarem pedidos e orçamentos, com painel administrativo protegido e integração mock com o GestãoClick.

### Etapas

**1. Backend (Lovable Cloud)**
- Ativar Lovable Cloud (Supabase gerenciado)
- Criar tabelas: `categories`, `products`, `customers`, `orders`, `order_items`, `settings`, `integration_logs`
- Criar enum `app_role` e tabela `user_roles` + função `has_role` (segurança correta para admin)
- RLS conforme especificado (público lê produtos/categorias ativos, insere clientes/pedidos; admin gerencia tudo)
- Bucket Storage `product-images` (público)
- Seed: 6 categorias e ~8 produtos de demonstração
- Edge Function `send-order-to-gestaoclick` em modo mock, registrando em `integration_logs`
- Secrets: `GESTAOCLICK_API_URL`, `GESTAOCLICK_API_TOKEN`, `GESTAOCLICK_MOCK_MODE`

**2. Design System**
- Paleta moderna profissional (azul corporativo + neutros), tipografia limpa
- Tokens semânticos em `index.css` + `tailwind.config.ts`
- Variantes shadcn (Button, Card, Badge)
- Português BR, formatação BRL, máscaras CNPJ/telefone

**3. Portal Público (cliente)**
- Layout com header (logo NovaPrint, busca, carrinho com contador) + footer
- `/` Home: hero, busca, categorias destaque, produtos destaque
- `/catalogo` Lista: filtros por categoria, busca por nome/código/marca, grid de cards
- `/produto/:id` Detalhe: foto grande, infos, quantidade, adicionar ao carrinho
- `/carrinho` Carrinho: itens, qty, remover, subtotais, total — persistido em localStorage (Zustand)
- `/checkout` Finalização: form (nome, empresa, CNPJ, telefone, email, observações) com validação Zod, resumo, envia pedido
- `/pedido/:id` Confirmação: número, status, mensagem

**4. Painel Administrativo (`/admin`)**
- `/admin/login` via Supabase Auth (email/senha)
- Guard: só usuários com role `admin`
- Dashboard: KPIs (produtos ativos, total pedidos, recebidos, erros)
- Produtos: CRUD + upload de imagem para Storage + inativar
- Categorias: CRUD
- Pedidos: lista + detalhe (cliente, itens), alterar status, botão "reenviar ao GestãoClick" (chama edge function mock)
- Logs de integração: tabela com filtros

**5. Integração GestãoClick (mock)**
- `src/services/gestaoclickService.ts` invoca a edge function
- Edge function busca pedido/cliente/itens, monta payload, em mock simula sucesso, gera `gestaoclick_id` fictício, atualiza pedido → `enviado_ao_gestaoclick`, registra log; em erro → `erro_integracao`

### Detalhes técnicos
- Roteamento: React Router (rotas públicas + `/admin/*` protegidas)
- Estado carrinho: Zustand + persist localStorage
- Forms: react-hook-form + Zod
- Queries: TanStack Query
- O primeiro usuário admin precisará ser criado: vou orientar a criar a conta via tela de signup admin e atribuir role `admin` (instruções no final)
- SEO básico (title/meta/H1) na home

### Observação
- A integração real com GestãoClick fica em mock. Quando o usuário tiver o token real, basta adicionar nos Secrets e ajustar `GESTAOCLICK_MOCK_MODE=false`.
- Vou pedir confirmação sobre criar o primeiro admin: após o build, você cria a conta em `/admin/login` (link "Criar conta") e eu rodo um update para promover esse e-mail a admin — ou prefere que eu já deixe um e-mail fixo como admin?

Posso prosseguir com a implementação completa?