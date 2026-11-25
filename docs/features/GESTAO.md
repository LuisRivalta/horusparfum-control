# 📋 Gestão

Módulo para ferramentas de gestão da loja. Hoje tem o **Quadro** (kanban).

> Migration `20261125110000_tarefas.sql` (tabela em [[BANCO]]). Spec: `docs/superpowers/specs/2026-11-25-kanban-gestao-design.md`.

## Telas

| Rota | Componente | O que faz |
|------|------------|-----------|
| `/gestao` | `Kanban` | Colunas A fazer / Fazendo / Feito; "Nova tarefa" cria em A fazer; clicar no cartão edita ou exclui (confirmação no botão); arrastar entre colunas e reordenar; botões ←/→ para celular e teclado |

## Regras

- Colunas coloridas como o kanban de parede: A fazer vermelho, Fazendo amarelo, Feito verde (faixa no topo + fundo suave).
- Cartão: título (obrigatório), descrição, prazo e prioridade (Alta / Média / Baixa, padrão Média; selo em tom neutro para não confundir com as cores das colunas).
- Dentro da coluna: Alta em cima, depois Média e Baixa; mesma prioridade segue a ordem manual. Soltar sobre um cartão de outra prioridade não muda de grupo (acima = 1º do grupo; abaixo = último). Migration `20261125120000_tarefas_prioridade.sql`.
- Prazo: fora de "Feito", vencido = "Atrasado" (vermelho), hoje = "Hoje" (dourado). Data em dd/mm, comparada com o dia local.
- Ordem: soltar sobre um cartão entra **antes** dele; no espaço vazio da coluna, no fim. Grava só a linha movida (`ordem` = média dos vizinhos).
- Falha ao gravar mostra o aviso e recarrega do banco.

## Arquivos

- `frontend/src/pages/gestao/Kanban.tsx`, `frontend/src/lib/kanban.ts` (+ testes em `__tests__`)
- `supabase/migrations/20261125110000_tarefas.sql`, `supabase/checks/20261125110000_tarefas_check.sql`

## Limites conhecidos

- Sem tempo real: o que o outro sócio mudar aparece ao recarregar a página.
- Sem arquivar: cartões em "Feito" ficam lá até serem excluídos.
