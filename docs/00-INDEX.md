# 🗂️ Horus Parfum — Índice da Documentação

Bem-vindo ao índice central de documentação do **Horus Parfum Control**, o painel administrativo interno para gestão financeira e de estoque da Horus Parfum.

---

## 📖 Documentos Globais

| Documento | Conteúdo |
|---|---|
| [[PRD]] | **Requisitos do Produto:** O que o app faz, escopo, regras gerais de negócio e público-alvo. |
| [[ARQUITETURA]] | **Arquitetura de Software:** Stack técnica, pastas, fluxo de dados e guia de estilo de código. |
| [[BANCO]] | **Banco de Dados:** Schema completo, chaves, relações e funções RPC PL/pgSQL. |
| [[REGRAS_NEGOCIO]] | **Regras de Negócio:** Compilado detalhado de regras fiscais, comerciais e lógicas do ERP. |
| [[FLUXOS]] | **Fluxos de Usuário:** Diagramas passo a passo das jornadas mais importantes do sistema. |
| [[API]] | **Referência de Endpoints:** Detalhes de requests, responses e status da API REST backend. |
| [[DEPLOY]] | **Deploy & Infraestrutura:** Variáveis de ambiente, scripts de build e infraestrutura cloud. |
| [[DESIGN_SYSTEM]] | **Identidade Visual & UI:** Tipografia, paleta de cores (variáveis CSS), 3D e responsividade. |
| [[TESTING]] | **Diretrizes de Testes:** Estrutura e convenções de testes automatizados com Vitest. |
| [[GLOSSARIO]] | **Glossário:** Termos do domínio da perfumaria autoral e definições de métricas do ERP. |
| [[HANDOFF_IA]] | **Handoff:** Estado atual do projeto, pendências e próximos passos para as IAs. |
| [[LOGS]] | **Logs do Projeto:** Histórico detalhado de todas as sessões de desenvolvimento. |

---

## 📦 Documentação por Feature / Módulo

Abaixo estão os guias detalhados de cada módulo funcional do sistema, explicando o funcionamento da tela, chamadas de serviço, validações locais e tabelas associadas.

### 💰 Financeiro
- [[features/FINANCEIRO]] — Visão geral, dashboard financeiro, contas a pagar/receber e transações manuais.
- [[features/METAS]] — Progresso de metas financeiras mensais, anuais e trimestrais com cálculo automatizado via backend.
- [[features/RELATORIOS]] — Geração e exportação (PDF/CSV) de relatórios do fluxo de caixa com precisão decimal.

### 🧪 Estoque e Operações
- [[features/ESTOQUE]] — Controle de estoque físico, cadastro de marcas, fornecedores e situação de estoque (badge color).
- [[features/PEDIDOS]] — Gestão de compras com fornecedores, conferência física de recebimento e registro de divergências.
- [[features/VENDAS]] — Nova venda (produtos/decants) com rateio proporcional de taxas/fretes e dashboard de rentabilidade (ROI).
- [[features/DECANTS]] — Fracionamento de frascos originais e controle de consumo não-faturável (amostras/perdas).
- [[features/AUTENTICACAO]] — Fluxo de login e políticas RLS de segurança e controle de acessos.

---

## 🧩 Histórico de Design e Implementação

Toda a evolução histórica de especificações de design (specs) e planos de desenvolvimento técnico (TDD) por feature está indexada em:
- [[superpowers/00-INDEX-HISTORICO]] — Histórico de especificações de design e planos técnicos.

---

## 🤖 Guia rápido para IAs (Desenvolvedores Virtuais)

Ao iniciar qualquer tarefa neste projeto, siga este fluxo:
1. **Consulte** o [[HANDOFF_IA]] para entender em qual sessão estamos e quais os próximos passos imediatos.
2. **Revise** as [[REGRAS_NEGOCIO]] aplicáveis para garantir conformidade com os cálculos e regras do ERP.
3. **Estude** a [[ARQUITETURA]] caso precise criar novos componentes frontend ou novos serviços backend.
4. **Atualize** o [[HANDOFF_IA]] e insira um novo registro detalhado em [[LOGS]] ao final de suas alterações.
