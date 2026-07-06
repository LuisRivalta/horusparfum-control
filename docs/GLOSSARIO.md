# 📖 Glossário

> Glossário completo de termos, conceitos e siglas utilizados no **Horus Parfum Control**.
> Referência rápida para desenvolvedores, operadores e novos membros da equipe.

---

## 🌸 Termos do Domínio (Perfumaria)

| Termo | Definição |
|---|---|
| **Decant** | Fracionamento de um perfume de frasco maior para frascos menores. O conteúdo do frasco original é dividido em porções menores para revenda individual. É o modelo de negócio central da perfumaria artesanal. |
| **Frasco Aberto** | Frasco de perfume que foi aberto (lacre rompido) para realizar decants. Um frasco aberto tem `ml_restante` que diminui a cada decant vendido ou consumo registrado. No sistema, apenas **um frasco ativo** por produto é permitido. |
| **ML (Mililitros)** | Unidade de medida padrão para volume de perfume. Utilizado em todo o sistema para quantificar volume de frascos, decants e consumos. |
| **Volume ML** | Tamanho do frasco original do perfume (ex: 100ml, 50ml, 200ml). Determina a capacidade total do frasco antes de ser fracionado. |
| **EDP (Eau de Parfum)** | Concentração de perfume com 15-20% de óleos essenciais. Termo frequente em nomes de produtos, porém **ignorado no fuzzy matching** do sistema por ser comum a muitos produtos. |
| **EDT (Eau de Toilette)** | Concentração de perfume com 5-15% de óleos essenciais. Também ignorado no fuzzy matching como stopword de perfumaria. |
| **Custo Médio Ponderado** | Média do custo unitário de um produto considerando as quantidades compradas em diferentes lotes e preços. Atualizado automaticamente a cada nova compra (recepção de pedido). Ver [[REGRAS_NEGOCIO#RE-03 — Custo Médio Ponderado]]. |
| **Fornecedor** | Empresa ou pessoa que fornece os perfumes para a perfumaria artesanal. Cada produto pode estar vinculado a um fornecedor no cadastro. |

---

## ⚙️ Termos do Sistema

| Termo | Definição |
|---|---|
| **Horus** | Nome do sistema ERP. Referência ao **Olho de Horus** da mitologia egípcia — símbolo de proteção, poder real e boa saúde. Representa a visão completa e controle total sobre a operação da perfumaria. |
| **Movimentação** | Registro de entrada ou saída de estoque de um produto. Movimentações são **geradas automaticamente** pelo sistema (nunca criadas manualmente) em eventos como vendas, cancelamentos e recepção de pedidos. |
| **Transação** | Registro financeiro que representa entrada (receita) ou saída (despesa) de dinheiro. Pode ser criada manualmente ou gerada automaticamente por vendas e consumos de decant. |
| **Pedido** | Pedido de compra feito a um fornecedor. Segue o fluxo: **rascunho → pendente → recebido**. Contém itens com quantidades e preços. Pode ser importado via PDF. |
| **Divergência** | Diferença entre a quantidade pedida e a quantidade efetivamente recebida em um pedido. Classificada como: `faltou`, `veio_a_mais`, `avariado` ou `produto_errado`. |
| **Conferência** | Processo de verificar os itens recebidos de um pedido, comparando `qtd_pedida` com `qtd_recebida` e registrando eventuais divergências. |
| **Canal** | Canal de venda onde a transação comercial foi realizada. Exemplos: Shopee, Mercado Livre, Instagram, WhatsApp, loja física. Usado para segmentar relatórios de vendas. |
| **Rateio** | Distribuição proporcional de custos (taxa da plataforma e frete) entre os itens de uma venda, com base no valor bruto de cada item. O último item absorve diferenças de arredondamento. Ver [[REGRAS_NEGOCIO#RV-03 — Rateio de Taxa e Frete]]. |
| **Giro** | Taxa de rotatividade do estoque (*turnover rate*). Indica quantas vezes o estoque de um produto foi vendido e reposto em um período. Giro alto = produto popular; giro baixo = produto parado. |
| **Cobertura** | Número de dias que o estoque atual de um produto é capaz de cobrir (*days of supply*), com base na média de vendas diárias. Exemplo: se o estoque é 30 unidades e a média de vendas é 2/dia, a cobertura é 15 dias. |
| **Encalhado / Parado** | Produto que possui estoque > 0 mas não teve nenhuma venda no período analisado. Indicador de produtos com baixa demanda que podem estar ocupando capital desnecessariamente. |
| **RPC** | *Remote Procedure Call* — No contexto do Horus, são funções **PL/pgSQL** hospedadas no Supabase que executam operações atômicas envolvendo múltiplas tabelas (ex: `registrar_venda`, `cancelar_venda`). Chamadas via `supabase.rpc()`. |
| **RLS** | *Row Level Security* — Mecanismo de segurança do PostgreSQL que controla acesso aos dados por linha, com base no usuário autenticado. **Habilitado em todas as tabelas** do Horus. Garante que um usuário só acesse seus próprios dados. |
| **Stub** | Endpoint da API que está implementado na estrutura de rotas mas retorna dados vazios (array vazio `[]`). É um placeholder que será substituído por lógica real futuramente. Ver tabela de endpoints em [[API]]. |
| **Module Switcher** | Componente de interface que permite alternar entre os módulos **Financeiro** e **Estoque** com um indicador deslizante animado. |
| **Glow Card** | Componente de card com efeito holográfico/brilho dourado no hover. Utilizado em cards de produtos para reforçar o visual premium. |
| **Glass Blur** | Efeito de *glassmorphism* (vidro fosco) aplicado em overlays, headers e modais. Criado com `backdrop-filter: blur()`. |

---

## 💰 Termos Financeiros

| Termo | Definição | Fórmula |
|---|---|---|
| **Receita / Entrada** | Dinheiro que entra no caixa. Gerado por vendas, recebimentos e outras fontes de renda. | — |
| **Despesa / Saída** | Dinheiro que sai do caixa. Gerado por compras, custos operacionais, consumo de decants. | — |
| **Lucro Bruto** | Diferença entre a receita e o custo dos produtos vendidos. | `Lucro = Receita - Custo` |
| **Margem** | Percentual do lucro em relação à receita. Indica a rentabilidade de uma venda. | `Margem = (Lucro / Receita) × 100` |
| **ROI** | *Return on Investment* — Retorno sobre o investimento. Indica quanto de lucro foi gerado para cada real investido. | `ROI = (Lucro / Custo) × 100` |
| **Ticket Médio** | Valor médio de cada venda no período. | `Ticket = Faturamento / Nº de Vendas` |
| **Meta** | Objetivo financeiro definido pelo usuário com valor alvo e período. Metas monetárias têm progresso calculado automaticamente; metas percentuais requerem atualização manual. | `Progresso = (Atual / Alvo) × 100` |
| **Saldo Histórico** | Soma acumulada de todas as entradas menos todas as saídas desde o início da operação no sistema. Diferente do saldo do período filtrado. | `Saldo = Σ(entradas) - Σ(saídas)` |
| **Faturamento Bruto** | Total de receita gerada por vendas antes de descontar custos, taxas e fretes. | `Σ(valor_bruto)` de todas as vendas |
| **Custo Total** | Soma dos custos de aquisição de todos os produtos vendidos no período. | `Σ(custo_unitário × quantidade)` |

---

## 🔤 Siglas

| Sigla | Significado | Contexto |
|---|---|---|
| **BRL** | Real Brasileiro | Moeda padrão do sistema. Todos os valores monetários são em BRL. |
| **JWT** | JSON Web Token | Token de autenticação emitido pelo Supabase Auth. Enviado no header `Authorization: Bearer <token>`. |
| **CORS** | Cross-Origin Resource Sharing | Política de segurança do navegador. O backend configura CORS para aceitar requisições apenas do frontend autorizado. |
| **CRUD** | Create, Read, Update, Delete | Operações básicas de persistência de dados. |
| **SPA** | Single Page Application | Arquitetura do frontend — uma única página HTML com navegação via JavaScript (React Router). |
| **RPC** | Remote Procedure Call | Chamada de função remota. No Supabase, são funções PL/pgSQL invocadas via SDK. |
| **RLS** | Row Level Security | Segurança a nível de linha no PostgreSQL. |
| **API** | Application Programming Interface | Interface de comunicação entre frontend e backend via HTTP/REST. |
| **ERP** | Enterprise Resource Planning | Sistema de gestão empresarial. O Horus é um ERP voltado para perfumaria artesanal. |
| **UI** | User Interface | Interface do usuário — a parte visual do sistema. |
| **UX** | User Experience | Experiência do usuário — como o sistema é percebido e utilizado. |
| **CSS** | Cascading Style Sheets | Linguagem de estilização visual. O Horus usa Tailwind CSS 4. |
| **PDF** | Portable Document Format | Formato de arquivo usado para importar pedidos de fornecedores. |
| **ASGI** | Asynchronous Server Gateway Interface | Interface padrão Python para servidores web assíncronos. FastAPI é baseado em ASGI. |
| **ORM** | Object-Relational Mapping | Mapeamento objeto-relacional. O Horus não usa ORM tradicional — conecta diretamente via Supabase SDK. |
| **KPI** | Key Performance Indicator | Indicador-chave de desempenho. Exibidos nos dashboards (faturamento, margem, ROI, etc.). |

---

## 🏗️ Termos Técnicos de Infraestrutura

| Termo | Definição |
|---|---|
| **Vercel** | Plataforma de deploy serverless utilizada para hospedar tanto o frontend (Vite/React) quanto o backend (FastAPI/Python) do Horus. |
| **Supabase** | Plataforma open-source alternativa ao Firebase. Fornece banco de dados PostgreSQL, autenticação, storage e funções RPC para o Horus. |
| **Serverless** | Modelo de computação onde o provedor gerencia a infraestrutura de servidores. O código é executado sob demanda, sem servidores dedicados. |
| **Edge Network** | Rede de servidores distribuídos globalmente. A Vercel serve o frontend a partir do servidor mais próximo do usuário. |
| **Tailwind CSS** | Framework CSS utilitário. O Horus usa a versão 4 com configuração customizada para o design system. |
| **React Three Fiber** | Biblioteca que permite usar Three.js dentro de componentes React. Utilizado para os elementos 3D do Horus (frascos, gradientes). |
| **Recharts** | Biblioteca de gráficos para React. Utilizada para os charts financeiros e dashboards de vendas. |
| **Lenis** | Biblioteca de smooth scroll. Proporciona scroll suave e inercial em toda a aplicação. |
| **Decimal.js** | Biblioteca JavaScript para aritmética de precisão arbitrária. Obrigatória para cálculos financeiros no frontend. |
| **Fuzzy Matching** | Técnica de comparação textual que encontra correspondências aproximadas (não exatas). Usado na importação de pedidos via PDF. |

---

## 📎 Documentos Relacionados

- [[PRD]] — Documento de requisitos do produto
- [[REGRAS_NEGOCIO]] — Regras de negócio detalhadas de cada módulo
- [[BANCO]] — Estrutura do banco de dados e esquema das tabelas
