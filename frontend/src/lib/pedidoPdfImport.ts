export interface ProdutoOpcao {
  id: string
  nome: string
}

export interface PedidoPdfItem {
  nome: string
  codigo?: string | null
  qtd: number
  preco_unitario: number
  total?: number
}

export interface PedidoPdfResponse {
  itens: PedidoPdfItem[]
  avisos: string[]
}

export type MatchStatus = 'matched' | 'unmatched' | 'ambiguous'

export interface ItemImportadoForm {
  produto_id: string
  qtd: string
  preco: string
  importado_nome: string
  importado_codigo?: string | null
  matchStatus: MatchStatus
}

export function normalizarNomeProduto(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function casarItemImportado(item: PedidoPdfItem, produtos: ProdutoOpcao[]): ItemImportadoForm {
  const nomeNormalizado = normalizarNomeProduto(item.nome)
  const matches = produtos.filter((produto) => normalizarNomeProduto(produto.nome) === nomeNormalizado)
  const matchUnico = matches.length === 1 ? matches[0] : null

  return {
    produto_id: matchUnico?.id ?? '',
    qtd: String(item.qtd),
    preco: String(item.preco_unitario),
    importado_nome: item.nome,
    importado_codigo: item.codigo ?? null,
    matchStatus: matchUnico ? 'matched' : matches.length > 1 ? 'ambiguous' : 'unmatched',
  }
}

export async function importarPedidoPdf({
  file,
  token,
  apiUrl,
}: {
  file: File
  token: string
  apiUrl: string
}): Promise<PedidoPdfResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${apiUrl}/api/estoque/pedidos/importar-pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.detail || 'Falha ao importar PDF')
  }

  if (!data || !Array.isArray(data.itens)) {
    throw new Error('Resposta inválida da API')
  }

  return {
    itens: data.itens,
    avisos: Array.isArray(data.avisos) ? data.avisos : [],
  }
}
