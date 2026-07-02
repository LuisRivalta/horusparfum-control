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

const MATCH_THRESHOLD = 0.78
const AMBIGUOUS_DELTA = 0.03
const IGNORED_MATCH_TOKENS = new Set(['edp'])

export function normalizarNomeProduto(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function extrairVolumeMl(nome: string) {
  const match = normalizarNomeProduto(nome).match(/\b(\d{1,4})\s*ml\b/)
  return match ? Number(match[1]) : null
}

function tokensParaMatch(nome: string) {
  return normalizarNomeProduto(nome)
    .split(' ')
    .filter((token) => token && !IGNORED_MATCH_TOKENS.has(token))
}

function tokenScore(importado: string, cadastrado: string) {
  const importadoTokens = new Set(tokensParaMatch(importado))
  const cadastradoTokens = new Set(tokensParaMatch(cadastrado))

  if (importadoTokens.size === 0 || cadastradoTokens.size === 0) return 0

  const comuns = [...importadoTokens].filter((token) => cadastradoTokens.has(token)).length
  return (2 * comuns) / (importadoTokens.size + cadastradoTokens.size)
}

function encontrarMatchFuzzy(item: PedidoPdfItem, produtos: ProdutoOpcao[]) {
  const volumeImportado = extrairVolumeMl(item.nome)
  const candidatos = produtos
    .map((produto) => {
      const volumeProduto = extrairVolumeMl(produto.nome)
      if (volumeImportado !== null && volumeProduto !== null && volumeImportado !== volumeProduto) {
        return { produto, score: 0 }
      }

      const score = tokenScore(item.nome, produto.nome)
      return { produto, score }
    })
    .filter((candidato) => candidato.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  const melhor = candidatos[0]
  if (!melhor) return { produto: null, status: 'unmatched' as MatchStatus }

  const segundo = candidatos[1]
  if (segundo && melhor.score - segundo.score <= AMBIGUOUS_DELTA) {
    return { produto: null, status: 'ambiguous' as MatchStatus }
  }

  return { produto: melhor.produto, status: 'matched' as MatchStatus }
}

export function casarItemImportado(item: PedidoPdfItem, produtos: ProdutoOpcao[]): ItemImportadoForm {
  const nomeNormalizado = normalizarNomeProduto(item.nome)
  const matches = produtos.filter((produto) => normalizarNomeProduto(produto.nome) === nomeNormalizado)
  const matchUnico = matches.length === 1 ? matches[0] : null
  const fuzzy = matchUnico ? null : matches.length > 1 ? null : encontrarMatchFuzzy(item, produtos)
  const produto = matchUnico ?? fuzzy?.produto ?? null
  const matchStatus: MatchStatus = matchUnico ? 'matched' : matches.length > 1 ? 'ambiguous' : fuzzy?.status ?? 'unmatched'

  return {
    produto_id: produto?.id ?? '',
    qtd: String(item.qtd),
    preco: String(item.preco_unitario),
    importado_nome: item.nome,
    importado_codigo: item.codigo ?? null,
    matchStatus,
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
