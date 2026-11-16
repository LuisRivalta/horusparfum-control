import type { AlvoAnuncio } from '@/lib/anuncios'
import type { CotacaoOuErro, Qualidade, TipoML } from '@/lib/apiAnuncios'

/** Um anúncio sendo montado na tela (frasco ou um tamanho de decant). */
export interface ItemAnuncio {
  chave: string
  alvo: AlvoAnuncio
  marcado: boolean
  bloqueio: string | null
  custo: number | null
  margem: number // fração sobre o custo
  listingType: TipoML
  titulo: string
  descricao: string
  id?: string
  status?: string
  permalink?: string | null
  erro?: string | null
  qualidade?: Qualidade
}

// sig: custo|margem|tipo usados no cálculo; cotação de outro sig é velha e não vale
export type Cotacoes = Record<string, Partial<Record<TipoML, CotacaoOuErro>> & { sig?: string }>
export const sigPreco = (i: { custo: number | null; margem: number; alvo: AlvoAnuncio }) => `${i.custo}|${i.margem}|${i.alvo.tipo}`

export const fmtMl = (n: number) => String(n).replace('.', ',')
export const rotulo = (a: AlvoAnuncio) => (a.tipo === 'frasco' ? 'Frasco' : `Decant ${fmtMl(a.ml ?? 0)} ml`)
/** Publicado/pausado no ML: esta tela só mostra. */
export const editavel = (i: ItemAnuncio) => i.status !== 'publicado' && i.status !== 'pausado'
export const TIPOS_ML: { id: TipoML; nome: string }[] = [
  { id: 'gold_special', nome: 'Clássico' }, { id: 'gold_pro', nome: 'Premium' },
]
export const card = 'gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-4'
export const tituloSecao = 'text-sm font-medium uppercase tracking-[.08em] text-muted'

export function precoEscolhido(i: ItemAnuncio, cotacoes: Cotacoes): number | null {
  const linha = cotacoes[i.chave]
  const c = linha?.sig === sigPreco(i) ? linha[i.listingType] : undefined
  return c && 'preco' in c ? c.preco : null
}
