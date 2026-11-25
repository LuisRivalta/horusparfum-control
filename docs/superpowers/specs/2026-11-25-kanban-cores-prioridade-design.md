# Kanban: cores das colunas e prioridade — design (mudança pequena)

> 2026-11-25. Aprovado pelo Luis na conversa ("ok"). Spec e plano juntos por ser pequeno.

## Por quê

O Luis quer o quadro como o kanban de parede (Para fazer vermelho, Fazendo amarelo, Feito verde) e quer definir prioridade nas tarefas.

## Decidido com o Luis

- Colunas coloridas: A fazer = vermelho, Fazendo = amarelo, Feito = verde.
- Prioridade Alta / Média / Baixa; dentro da coluna os cartões se organizam sozinhos por prioridade (Alta em cima).
- Prazo continua como está.

## Calls do Claude (mostradas ao Luis antes do ok)

- Cor da coluna = faixa forte no topo + fundo bem suave (tokens `down`, `warn`, `up`), para ler bem no tema escuro e no claro.
- Prioridade no cartão com ícone + texto em tons neutros (não vermelho/amarelo/verde, para não confundir com as colunas).
- Tarefas novas e as já existentes = Média.
- Mesma prioridade: vale a ordem manual. Soltar sobre um cartão de outra prioridade não pula de grupo: acima do grupo vira o 1º do grupo; abaixo, o último. Para subir de verdade, muda a prioridade.

## Abordagens

1. **Coluna `prioridade` em `tarefas` + ordenação no frontend** — escolhida.
2. Prioridade embutida na `ordem` (faixas numéricas) — descartada: trocar prioridade exigiria recalcular a ordem e a regra fica escondida.

## Plano

1. Migration `supabase/migrations/20261125120000_tarefas_prioridade.sql`: `alter table tarefas add column if not exists prioridade text not null default 'media' check (prioridade in ('alta','media','baixa'))`; check em `supabase/checks/`.
2. `lib/kanban.ts`: `Prioridade`, `PRIORIDADES`, `Tarefa.prioridade`; `agrupar` ordena por peso da prioridade e depois `ordem`; `ordemNoGrupo(coluna, antesDeId, movida)` aplica a regra acima. Testes.
3. `Kanban.tsx`: cores das colunas, select de prioridade no formulário, selo no cartão, mover/soltar via `ordemNoGrupo`. Testes.
4. Docs (GESTAO, BANCO, HANDOFF, LOGS). `npx vitest run`, `npm run build`, commit local.
