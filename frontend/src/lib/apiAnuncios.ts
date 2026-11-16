import { supabase } from '@/lib/supabase'
import type { TipoAnuncio } from '@/lib/anuncios'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

/** Chama o backend com o JWT da sessão; lança Error(detail) se falhar. */
export async function chamarApi<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  const resp = await fetch(`${API_URL}${caminho}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const corpo = await resp.json().catch(() => null)
  if (!resp.ok) {
    const d = corpo?.detail
    throw new Error(typeof d === 'string' ? d : `Erro ${resp.status} na API`)
  }
  return corpo as T
}

const post = <T>(c: string, body?: unknown) =>
  chamarApi<T>(c, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export interface ConexaoML { conectado: boolean; nickname: string | null; user_product: boolean }
export interface AtributoML {
  id: string; name: string; value_type: string
  values?: { id: string; name: string }[]; tags?: unknown
}
// medida faltando vai como null: o backend devolve {erro} só para aquele tipo
export interface Pacote { peso_g: number | null; altura_cm: number | null; largura_cm: number | null; comprimento_cm: number | null }
export type TipoML = 'gold_special' | 'gold_pro'
export interface ItemPreco { chave: string; custo: number; margem: number; tipo: TipoAnuncio }
export interface Cotacao { preco: number; comissao: number; taxa_fixa: number; frete: number; lucro: number }
export type CotacaoOuErro = Cotacao | { erro: string }
export interface PrecosBody { itens: ItemPreco[]; pacotes: { frasco: Pacote; decant: Pacote } }
export interface PrecosResp { itens: { chave: string; gold_special: CotacaoOuErro; gold_pro: CotacaoOuErro }[] }
export interface AnuncioTexto { chave: string; tipo: TipoAnuncio; ml: number | null }
export interface TextoGerado { chave: string; titulo: string; descricao: string }
export interface ResultadoPublicar { id: string; status: string; ml_item_id?: string; erro?: string }
export interface Qualidade {
  score: number | null; nivel: string | null
  pendencias: { titulo: string; texto: string; link: string }[]
}
export interface ItemConta {
  ml_item_id: string; titulo: string; preco: number; quantidade: number
  status: string; permalink: string; volume_ml: number | null; ligado: boolean
}
export interface LigarBody { ml_item_id: string; produto_id: string; tipo: TipoAnuncio; ml: number | null }

export const conexaoML = () => chamarApi<ConexaoML>('/api/mercadolivre/conexao')
export const conectarML = () => chamarApi<{ url: string }>('/api/mercadolivre/conectar')
export const desconectarML = () => post<unknown>('/api/mercadolivre/desconectar')
export const atributosCategoria = () => chamarApi<AtributoML[]>('/api/anuncios/atributos')
export const calcularPrecos = (body: PrecosBody) => post<PrecosResp>('/api/anuncios/precos', body)
export const sugerirFicha = (produtoId: string) =>
  post<{ ficha: unknown }>('/api/anuncios/ia/ficha', { produto_id: produtoId })
export const gerarTextos = (produtoId: string, anuncios: AnuncioTexto[]) =>
  post<{ textos: TextoGerado[] }>('/api/anuncios/ia/textos', { produto_id: produtoId, anuncios })
export const publicar = (ids: string[]) =>
  post<{ resultados: ResultadoPublicar[] }>('/api/anuncios/publicar', { ids })
export const qualidade = (id: string) => chamarApi<Qualidade>(`/api/anuncios/${id}/qualidade`)
export const atualizarQuantidade = (id: string) =>
  post<{ quantidade: number }>(`/api/anuncios/${id}/quantidade`)
export const alterarStatus = (id: string, status: 'paused' | 'active') =>
  post<unknown>(`/api/anuncios/${id}/status`, { status })
export const aplicarPreco = (id: string, preco: number) =>
  post<unknown>(`/api/anuncios/${id}/preco`, { preco })
export const itensDaConta = () => chamarApi<{ itens: ItemConta[] }>('/api/anuncios/conta/itens')
export const ligarAnuncio = (body: LigarBody) => post<unknown>('/api/anuncios/ligar', body)
