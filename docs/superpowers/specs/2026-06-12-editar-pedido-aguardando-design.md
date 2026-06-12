# Design — Edição de Pedido Aguardando

> Data: 2026-06-12 · Status: aprovado pelo usuário

## Resumo

Pedidos com status `aguardando` poderão ser editados: fornecedor, previsão de chegada e lista de itens (adicionar, remover, alterar quantidade e preço). O modal de criação (`NovoPedidoModal`) é reutilizado com um prop opcional `pedidoParaEditar` que ativa o modo de edição — mesma UI, comportamento diferente no submit.

## Escopo

**Dentro do escopo:**
- Editar fornecedor, previsão de chegada e itens de pedidos `aguardando`
- Botão "Editar" na lista de pedidos (ao lado de "Confirmar chegada" e "Cancelar")
- Dois testes automatizados cobrindo pré-preenchimento e submit

**Fora do escopo:**
- Edição de pedidos `recebido` ou `cancelado` (imutáveis por regra de negócio)
- Alteração de responsável, status ou data de criação
- Transação SQL nativa para o update (rollback manual é suficiente para `aguardando`)

## Mudanças em NovoPedidoModal

### Novos props

```typescript
interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void  // renomeia onCreated; call site em Pedidos.tsx atualizado junto
  pedidoParaEditar?: {
    id: string
    numero: number
    fornecedor_id: string
    previsao_chegada: string | null
  }
}
```

Os itens existentes são carregados dentro do modal via query quando `pedidoParaEditar` está presente — não são passados como prop para evitar prop drilling e garantir que o dado seja fresco.

### Fetch ao abrir (modo edição)

Quando `pedidoParaEditar` está presente, o `useEffect` que já carrega fornecedores/produtos/categorias também busca:

```sql
SELECT produto_id, qtd_pedida, preco_unitario
FROM pedido_itens
WHERE pedido_id = <id>
```

Os resultados pré-preenchem o estado `itens` como `ItemForm[]`.

### Submit no modo edição

Sequência:

1. `UPDATE pedidos SET fornecedor_id, previsao_chegada, valor_total WHERE id = x AND status = 'aguardando'`
2. Snapshot dos itens antigos (caso necessite rollback)
3. `DELETE FROM pedido_itens WHERE pedido_id = x`
4. `INSERT pedido_itens` com novos valores
5. Se o INSERT falhar: re-insere snapshot dos itens antigos e lança erro para o usuário

A guarda `AND status = 'aguardando'` no UPDATE previne edição acidental de pedidos cujo status mudou entre o clique e o submit (ex: outra aba confirmou a chegada).

### UI

- Título: "Editar pedido #N" (em vez de "Novo pedido")
- Botão de submit: "Salvar alterações" (em vez de "Criar pedido")
- Comportamento de reset ao fechar: limpa estado normalmente (sem diferença entre criar e editar)

## Mudanças em Pedidos.tsx

- Adiciona estado `editando: PedidoRow | null`
- Busca `pedido_itens` na hora do clique em "Editar" — não são armazenados em `PedidoRow` (evita over-fetch na listagem)
- Botão "Editar" aparece apenas para pedidos `aguardando`, ao lado dos botões existentes
- `NovoPedidoModal` recebe `pedidoParaEditar` quando `editando` está preenchido

## Testes

Dois testes novos em `NovoPedidoModal.test.tsx`:

1. **Pré-preenchimento:** ao abrir com `pedidoParaEditar`, campos de fornecedor, previsão e itens refletem os dados buscados
2. **Submit edição:** confirma que o handler chama UPDATE + DELETE + INSERT com os dados corretos (Supabase mockado)

## Regras de negócio preservadas

- Duplicação de produto na mesma linha: bloqueado (validação existente)
- Item incompleto: bloqueado (validação existente)
- Pedido sem itens: bloqueado (validação existente)
- Status ≠ `aguardando` no momento do save: UPDATE retorna 0 linhas → erro exibido ao usuário
