import { chamarApi } from '@/lib/apiAnuncios'

const post = <T>(c: string, body?: unknown) =>
  chamarApi<T>(c, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export interface ConexaoShopify { conectado: boolean; loja: string | null; conectado_em: string | null }
export interface VarianteShopify {
  produto_id_ext: string; produto_titulo: string; variante_id: string; variante_titulo: string
  sku: string | null; estoque_id: string | null
  vinculo: { produto_id: string; tipo: 'frasco' | 'decant'; ml: number | null } | null
}
export interface LigarShopifyBody {
  variante_id: string; produto_ext_id: string | null; estoque_id: string; titulo: string | null
  produto_id: string; tipo: 'frasco' | 'decant'; ml: number | null
}
export interface ResultadoSync { enviados: number; erros: string[] }
export interface PublicarShopifyBody {
  produto_id: string; titulo: string; descricao: string; fotos: string[]
  variantes: { tipo: 'frasco' | 'decant'; ml: number | null; preco: number }[]
}

export const apiShopify = {
  conexao: () => chamarApi<ConexaoShopify>('/api/shopify/conexao'),
  conectar: () => post<ConexaoShopify>('/api/shopify/conectar'),
  variantes: (cursor?: string | null) =>
    chamarApi<{ itens: VarianteShopify[]; proximo: string | null }>(
      `/api/shopify/variantes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  ligar: (body: LigarShopifyBody) => post<ResultadoSync>('/api/shopify/vinculos', body),
  desligar: (varianteId: string) =>
    chamarApi<unknown>(`/api/shopify/vinculos/${encodeURIComponent(varianteId)}`, { method: 'DELETE' }),
  conferir: () => post<{ novos: number }>('/api/canais/pedidos/conferir'),
  sincronizarTudo: () => post<ResultadoSync>('/api/canais/sincronizar'),
  publicar: (body: PublicarShopifyBody) =>
    post<{ produto_ext_id: string; variantes: number }>('/api/shopify/produtos', body),
}
