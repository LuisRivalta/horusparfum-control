# PRD — Horus Parfum Control

## Visão geral

Sistema administrativo interno da **Horus Parfum**, empresa de perfumaria artesanal/autoral. O painel atende 3-4 usuários (donos e operadores) e centraliza a gestão financeira e de estoque em uma interface unificada.

## Público-alvo

- Administradores da loja (1-2 pessoas)
- Operadores de estoque (1-2 pessoas)
- Acesso exclusivo via login — não é voltado ao cliente final

## Módulos

### Financeiro

| Tela | Funcionalidade |
|------|---------------|
| Dashboard | Saldo atual, receita/despesa do mês, lucro, gráficos de evolução |
| Transações | Registro de entradas e saídas com categoria, forma de pagamento, descrição |
| Contas a pagar | Boletos, notas de fornecedores, aluguel — com status e vencimento |
| Contas a receber | Vendas parceladas, pedidos corporativos pendentes |
| Relatórios | Análise por período, agrupado por categoria, exportável em PDF |
| Metas | Metas financeiras trimestrais com barra de progresso |

### Estoque / Operações

| Tela | Funcionalidade |
|------|---------------|
| Estoque | Visão geral dos produtos em estoque físico e alertas de quantidade |
| Cadastros | Gestão centralizada de Produtos, Categorias, Marcas e Fornecedores |
| Pedidos | Compras com fornecedores, recebimento em PDF, divergências e custo médio |
| Vendas | Registro de saídas (frascos e decants) com baixa de estoque e entrada financeira |
| Decants | Fracionamento de perfumes, consumo não-faturável e frascos abertos |
| Relatórios | Giro de estoque, produtos mais vendidos e dashboard de rentabilidade (ROI) |

## Regras de negócio

1. **Integração via Vendas** — o módulo de Vendas vincula Estoque e Financeiro: registrar uma venda baixa o estoque (frasco cheio ou ml de decant) e lança automaticamente no caixa (receita + taxa + frete). Lançamentos manuais no Financeiro (compra de insumos, infraestrutura) continuam independentes.
2. **Consumo não-faturável via Decants** — a página de Decants registra consumo que **não gera receita**: perda, brinde, amostra, marketing/sorteio, uso interno ou outro. Cada consumo calcula um custo gerencial (custo do perfume proporcionalmente ao ml + custo de embalagem, exceto para `perda` que não inclui embalagem) e lança automaticamente uma **despesa** em `transacoes` (`origem='decant'`). Vender um decant é feito exclusivamente pela página de **Vendas**.
3. **PDF obrigatório em relatórios** — relatórios financeiros e de giro devem poder ser exportados.
4. **Estoque mínimo** — produtos mantêm `estoque_minimo` para análise e relatórios; não há tela dedicada de Alertas no app.
5. **Multiusuário** — cada ação registra o responsável (nome do usuário logado).
6. **Dados em Real (BRL)** — toda formatação monetária em R$ com 2 casas decimais.
7. **Importação via PDF** — leitura inteligente de notas e pedidos de compra em PDF para preenchimento de itens e quantidades, com fuzzy matching.

## Fora de escopo (por enquanto)

- Integração com e-commerce
- PDV com captura de pagamento (o sistema registra vendas e seus efeitos em estoque/caixa, mas não processa pagamento)
- App mobile nativo
- Notificações push
- Multi-empresa / multi-loja

## Referência visual

O protótipo original (arquivado no git) define o visual: tema dark, dourado (#C9A84C) como cor de destaque, tipografia Inter + Cormorant Garamond + JetBrains Mono, iconografia line-stroke minimalista, identidade visual egípcia (Eye of Horus).
