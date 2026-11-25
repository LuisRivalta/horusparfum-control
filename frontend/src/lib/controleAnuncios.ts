export type Canal = 'ml' | 'shopify'
export type Variante = { tipo: 'frasco' | 'decant'; ml: number | null }
export type Marca = Variante & { produto_id: string; canal: Canal }
export type ProdutoControle = {
  id: string
  nome: string
  estoque_atual: number
  vende_decant: boolean
  ml_aberto: number | null
}
export type EstadoCelula = 'verde' | 'vermelha' | 'cinza'
export type EstadoPerfume = 'completo' | 'aguardando' | 'incompleto' | 'sem_anuncio'
export type Celula = Variante & { estado: EstadoCelula; manual: boolean }
export type LinhaControle = { produto: ProdutoControle; celulas: Celula[]; estado: EstadoPerfume }

const chave = (produtoId: string, v: Variante) => `${produtoId}|${v.tipo}|${Number(v.ml ?? 0)}`

export function variantesDo(p: ProdutoControle, tamanhos: number[]): Variante[] {
  const frasco: Variante = { tipo: 'frasco', ml: null }
  return p.vende_decant ? [frasco, ...tamanhos.map((ml): Variante => ({ tipo: 'decant', ml }))] : [frasco]
}

function estadoDe(celulas: Celula[]): EstadoPerfume {
  const tem = (e: EstadoCelula) => celulas.some((c) => c.estado === e)
  if (tem('vermelha')) return tem('verde') ? 'incompleto' : 'sem_anuncio'
  return tem('cinza') ? 'aguardando' : 'completo'
}

export function montarLinhas(
  produtos: ProdutoControle[],
  canal: Canal,
  tamanhos: number[],
  manuais: Marca[],
  automaticas: Marca[],
): LinhaControle[] {
  const set = (ms: Marca[]) => new Set(ms.filter((m) => m.canal === canal).map((m) => chave(m.produto_id, m)))
  const man = set(manuais)
  const aut = set(automaticas)
  return [...produtos]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((produto) => {
      const celulas = variantesDo(produto, tamanhos).map((v): Celula => {
        const k = chave(produto.id, v)
        if (aut.has(k)) return { ...v, estado: 'verde', manual: false }
        if (man.has(k)) return { ...v, estado: 'verde', manual: true }
        const disponivel =
          produto.estoque_atual > 0 || (v.tipo === 'decant' && (produto.ml_aberto ?? 0) >= Number(v.ml))
        return { ...v, estado: disponivel ? 'vermelha' : 'cinza', manual: false }
      })
      return { produto, celulas, estado: estadoDe(celulas) }
    })
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarLinhas(
  linhas: LinhaControle[],
  situacao: EstadoPerfume | 'todos',
  busca: string,
): LinhaControle[] {
  const q = norm(busca.trim())
  return linhas.filter(
    (l) => (situacao === 'todos' || l.estado === situacao) && norm(l.produto.nome).includes(q),
  )
}

export function paraMarcarTodas(linha: LinhaControle): Variante[] {
  return linha.celulas.filter((c) => c.estado === 'vermelha').map(({ tipo, ml }) => ({ tipo, ml }))
}
