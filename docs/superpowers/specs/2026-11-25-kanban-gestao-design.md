# Kanban (módulo Gestão) — design

> 2026-11-25. Tamanho: pequeno/médio. Feito em modo autônomo (/goal): o que o Luis disse está marcado; o resto são calls do Claude.

## Por quê

O Luis quer um quadro kanban normal para as tarefas da loja (de "higienizar a loja" a "postar story" ou "adicionar no ML os produtos do pedido novo"). Fica num módulo novo, **Gestão**, para receber outras ferramentas de gestão no futuro. (Luis)

## Objetivos

- Colunas **A fazer / Fazendo / Feito**. (Luis, no /goal)
- Cartão com **título, descrição e prazo**. (Luis, no /goal)
- **Arrastar** cartões entre colunas e reordenar dentro da coluna. (Luis, no /goal)
- Criar, editar e excluir cartão.

## Fora do escopo

- Ligar cartão a perfume (o Luis disse que é raro). Responsável, etiquetas, comentários, anexos, várias quadros, arquivar.
- Notificação de prazo.

## Abordagens

1. **Tabela `tarefas` + página com HTML5 drag-and-drop nativo** — escolhida: sem dependência nova; cada cartão guarda `status` e `ordem`.
2. Biblioteca de DnD (dnd-kit) — descartada: dependência nova para 3 colunas; o nativo resolve no desktop, e botões ←/→ cobrem celular e teclado.
3. Guardar o quadro inteiro num JSON — descartada: edição concorrente (dois sócios) sobrescreveria tudo.

## Decisões (calls do Claude)

- `ordem` é número fracionário: soltar entre dois cartões grava a média das ordens vizinhas (um update só); no fim da coluna, última + 1. Sem renumerar.
- Soltar sobre um cartão = entra **antes** dele; soltar no espaço vazio da coluna = entra no fim.
- Cada cartão tem botões ← / → (mudar de coluna, vai para o fim) — o drag nativo não funciona no toque.
- Prazo: cartão fora de "Feito" com prazo vencido fica com destaque vermelho ("Atrasado"); prazo de hoje, destaque dourado ("Hoje"). Data mostrada dd/mm.
- Clicar no cartão abre o modal de edição (mesmo modal de criar) com botão Excluir (confirmação no próprio botão: "Excluir" → "Confirmar exclusão").
- Botão "Nova tarefa" no topo cria em "A fazer", no fim.
- Módulo Gestão: aba no seletor do topo (Financeiro / Estoque / Anúncios / Gestão), menu com "Quadro" (`/gestao`), card na Home.
- Erros de gravação mostram mensagem e recarregam do banco.

## Banco

`supabase/migrations/20261125110000_tarefas.sql` (aplicada pelo Luis no SQL Editor):
`tarefas (id uuid pk, titulo text not null check (btrim(titulo) <> ''), descricao text, prazo date, status text not null default 'a_fazer' check in ('a_fazer','fazendo','feito'), ordem double precision not null default 0, created_at timestamptz default now())`, índice em `(status, ordem)`, RLS com a policy padrão "Acesso total autenticados".
