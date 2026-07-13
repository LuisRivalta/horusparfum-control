# Design - Correcao Unificada de Transacoes

> Data: 2026-07-13 | Status: aguardando revisao final do usuario

## Resumo

A pagina `Financeiro > Transacoes` passa a ser o ponto unico de correcao dos
lancamentos financeiros. A interface mantem uma tabela unica para entradas e
saidas, mas abre modais diferentes conforme a origem do registro:

- `manual`: editar ou excluir diretamente;
- `venda`: corrigir a venda inteira, sem sair da pagina;
- `decant`: estornar ou corrigir o consumo nao faturavel, preservando o saldo
  do frasco e o custo gerencial.

O modulo `Estoque > Vendas` continua responsavel pelo registro de novas
vendas, pela lista operacional e pelo dashboard de vendas. Ele reutilizara o
mesmo modal de edicao para que nao existam duas implementacoes da regra.

## Escopo

### Incluido

- Coluna de acoes na tabela de transacoes, acessivel tambem em telas pequenas
  pelo scroll horizontal ja existente.
- Edicao e exclusao confirmada de transacoes com `origem = 'manual'`.
- Modal de edicao de venda aberto diretamente em Transacoes para qualquer
  linha vinculada por `venda_id`.
- RPC atomica para atualizar uma venda concluida e todos os seus efeitos.
- Correcao de consumo de decant sem permitir que o financeiro se separe do
  saldo de ml e do registro de custo.
- Feedback de carregamento, sucesso e erro nos modais, seguido de recarga da
  tabela sem troca de rota.
- Testes de interface e de RPC para os caminhos de sucesso, confirmacao e
  falha atomica.

### Fora do escopo

- Alterar ou excluir diretamente uma transacao automatica de venda ou decant.
- Reabrir venda cancelada.
- Alterar `created_at` de transacoes manuais.
- Mudar a arquitetura dos dashboards financeiro ou de vendas.

## Experiencia visual

`/financeiro/transacoes` preserva a tabela atual e acrescenta a coluna final
`Acoes`. A coluna de origem fica explicita por badge e determina o menu:

| Origem | Acoes | Modal aberto |
| --- | --- | --- |
| Manual | Editar, Excluir | Formulario de transacao ou confirmacao de exclusao |
| Venda | Corrigir venda | Formulario completo da venda |
| Decant | Corrigir consumo | Formulario de estorno/correcao de consumo |

As tres linhas de caixa de uma venda (receita, taxa e frete) podem apontar
para a mesma venda. Cada uma exibe `Corrigir venda`; a acao usa o mesmo
`venda_id`, portanto qualquer linha abre o mesmo modal e atualiza o conjunto
inteiro quando salva.

O formulario de venda e apresentado como modal sobre a propria pagina de
Transacoes. Ele permite editar canal, data, forma de pagamento, cliente,
responsavel, observacao, taxa, frete e itens. Assim, o usuario corrige a
origem do dinheiro onde esta consultando o historico, sem confundir uma venda
com um lancamento manual.

## Dados e operacoes

### Transacoes manuais

`FinTransacoes` passa a manter uma transacao selecionada para edicao ou
exclusao. O formulario existente e reutilizado nos modos criar e editar,
preenchendo descricao, tipo, valor, categoria, forma de pagamento e
responsavel. O submit faz `UPDATE transacoes ... WHERE id = ? AND origem =
'manual'`.

A exclusao abre um modal destrutivo com os dados resumidos da linha e botoes
`Cancelar` e `Excluir`. A chamada faz `DELETE ... WHERE id = ? AND origem =
'manual'`; a guarda impede que uma linha automatica seja removida por engano,
mesmo em caso de estado desatualizado na tela.

### Correcao de venda

Uma nova RPC `editar_venda` recebe o ID da venda e o mesmo payload validado
por `registrar_venda`. Ela aceita somente vendas `concluida` e executa numa
unica transacao Postgres:

1. Bloqueia a venda, seus produtos e frascos envolvidos.
2. Estorna os efeitos atuais: devolve produtos, devolve ml de decants, remove
   os decants de venda e registra os movimentos de estorno no ledger.
3. Remove as transacoes com `origem = 'venda'` e os itens anteriores.
4. Atualiza o cabecalho da venda, mantendo o mesmo `id` e `numero`.
5. Aplica os novos itens, custos capturados, rateio de taxa/frete, lucro,
   estoque, decants e transacoes de caixa, seguindo as mesmas validacoes de
   `registrar_venda`.

Se o novo conjunto de itens nao tiver estoque ou ml suficiente, ou se qualquer
validacao falhar, o banco desfaz toda a operacao. Nenhuma transacao, custo,
estoque ou item parcial fica gravado.

O componente `EditarVendaModal` e usado tanto em Transacoes quanto em Vendas.
Ele carrega itens, canais, produtos, frascos e embalagens atuais ao abrir; nao
recebe esses dados por prop. Vendas concluida e cancelada mantem seus estados
atuais: cancelada continua imutavel.

### Correcao de consumo de decant

Uma transacao de consumo nao faturavel nao pode ser editada isoladamente: seu
valor depende de ml, classificacao, custo medio e embalagem. A correcao e
feita pelo modal proprio em duas etapas atomicas: estornar o consumo original
e, quando necessario, registrar o novo consumo com os campos corrigidos.

A migracao adiciona `decant_id` nullable a `transacoes`. A RPC
`registrar_consumo_decant` passa a preencher esse vinculo, e a nova RPC de
correcao o utiliza para devolver ml ao frasco, remover/recriar o registro em
`decants` e substituir a transacao de despesa correspondente.

Lancamentos de decant historicos nao possuem esse vinculo. Para que nenhum
historico seja alterado apenas no financeiro, o modal exige selecionar o
registro de consumo de decant correspondente antes de confirmar a primeira
correcao. Depois da confirmacao, a aplicacao grava o vinculo e as proximas
correcoes seguem o caminho atomico normal. Se nao for possivel identificar o
consumo, a tela bloqueia a acao e orienta registrar um ajuste manual; ela nunca
permite excluir somente a despesa automatica.

## Erros e concorrencia

- Todos os modais desabilitam o submit enquanto a operacao esta em andamento.
- Erros do Supabase ou das RPCs aparecem dentro do modal; ele permanece aberto
  com os dados preenchidos para permitir correcao.
- Guardas por `origem` e `status` protegem contra registros alterados por outra
  sessao entre abertura e confirmacao.
- Toda alteracao que mexe em estoque ou decants e feita por RPC. Nao havera
  sequencia de updates independentes no navegador.

## Testes

### Frontend

Novos testes de `FinTransacoes` devem cobrir:

1. Acoes corretas por origem e abertura do modal correspondente.
2. Preenchimento e `UPDATE` de transacao manual.
3. Confirmacao antes de excluir manual e `DELETE` protegido por origem.
4. Abertura de `EditarVendaModal` a partir de uma linha de venda, sem navegar
   para outra rota.
5. Exibicao de erro no modal e manutencao dos dados apos falha.

Testes de `EditarVendaModal` devem validar o carregamento dos itens e o payload
enviado para a RPC.

### Banco

Testes backend/RPC devem cobrir edicao de venda com atualizacao de valor,
forma de pagamento e itens; reprocessamento de estoque e lucro; rejeicao por
estoque insuficiente com rollback; rejeicao de venda cancelada; e estorno de
consumo de decant vinculado.

## Regras de negocio preservadas

- Valores continuam em BRL e sao exibidos com `formatBRL()`.
- Aritmetica de venda, custo, taxa, frete, lucro e ROI continua no banco com
  `numeric` e arredondamento consistente.
- O custo de produto nao volta a ser lancado no caixa durante a correcao de
  venda; a regra evita dupla contagem, como no fluxo original.
- Transacoes automaticas permanecem derivadas da origem operacional e nao
  podem ser manipuladas como lancamentos manuais.
