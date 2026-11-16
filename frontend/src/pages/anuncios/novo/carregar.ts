import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { listasAtivas, type ListaDb, type ListaInsumos } from '@/lib/insumos'
import type { Pacote, TipoML } from '@/lib/apiAnuncios'
import type { Ficha } from './FichaPerfume'

export interface Config {
  margem_padrao: number; tipo_padrao: TipoML; modelo_descricao: string | null
  ia_ativa: boolean; tamanhos_decant: number[] | null; canal_id: string | null
}
export interface Produto {
  id: string; nome: string; marca: string; volume_ml: number | null; estoque_atual: number
  custo_medio: number; gtin: string | null; ficha: Ficha
}
export interface Base {
  config: Config; produtos: Produto[]; listas: ListaInsumos[]
  custoPorInsumo: Record<string, number>; pacotes: { frasco: Pacote; decant: Pacote }
}
export interface AnuncioDb {
  id: string; tipo: 'frasco' | 'decant'; ml: number | null; listing_type: TipoML; margem: number | null
  titulo: string | null; descricao: string | null; status: string; permalink: string | null; erro: string | null
}

type ListaComPacote = ListaDb & Partial<Record<keyof Pacote, number | null>>
const num = (v: unknown) => (v == null ? null : Number(v))
const pacote = (ls: ListaComPacote[], tipo: string): Pacote => {
  const l = ls.find((x) => x.tipo === tipo)
  return { peso_g: num(l?.peso_g), altura_cm: num(l?.altura_cm), largura_cm: num(l?.largura_cm), comprimento_cm: num(l?.comprimento_cm) }
}

export async function carregarBase(): Promise<Base> {
  const [cfg, prods, marcas, listas, insumos] = await Promise.all([
    supabase.from('anuncios_config').select('*').eq('id', 1).single(),
    supabase.from('produtos').select('id, nome, marca_id, volume_ml, estoque_atual, custo_medio, gtin, ficha').order('nome'),
    supabase.from('marcas').select('id, nome'),
    supabase.from('insumo_listas').select('tipo, tamanho_ml, peso_g, altura_cm, largura_cm, comprimento_cm, insumo_lista_itens(insumo_id, quantidade)'),
    supabase.from('insumos').select('id, custo_medio, ativo'),
  ])
  const falha = [prods, marcas, listas, insumos].find((r) => r.error)?.error
  if (falha) throw new Error(`Não foi possível carregar os dados: ${falha.message}`)
  if (!cfg.data) throw new Error('Configuração dos anúncios não encontrada')
  const c = cfg.data as Config
  const nomeMarca = new Map(((marcas.data ?? []) as { id: string; nome: string }[]).map((m) => [m.id, m.nome]))
  const ins = (insumos.data ?? []) as { id: string; custo_medio: number | null; ativo: boolean }[]
  const ls = (listas.data ?? []) as ListaComPacote[]
  return {
    config: { ...c, margem_padrao: Number(c.margem_padrao), tamanhos_decant: (c.tamanhos_decant ?? []).map(Number) },
    produtos: ((prods.data ?? []) as (Produto & { marca_id: string | null })[]).map((p) => ({
      ...p, marca: nomeMarca.get(p.marca_id ?? '') ?? '', volume_ml: num(p.volume_ml),
      estoque_atual: Number(p.estoque_atual ?? 0), custo_medio: Number(p.custo_medio ?? 0), ficha: p.ficha ?? {},
    })),
    listas: listasAtivas(ls, ins),
    custoPorInsumo: Object.fromEntries(ins.map((i) => [i.id, Number(i.custo_medio ?? 0)])),
    pacotes: { frasco: pacote(ls, 'envio_frasco'), decant: pacote(ls, 'envio_decant') },
  }
}

// ficha e gtin relidos: podem ter mudado desde que a lista de produtos foi carregada
export async function carregarDoProduto(produtoId: string): Promise<{
  mlAberto: number; anuncios: AnuncioDb[]; ficha: Ficha; gtin: string
}> {
  const [abertos, anuncios, prod] = await Promise.all([
    supabase.from('frascos_abertos').select('ml_restante').eq('produto_id', produtoId).eq('status', 'ativo'),
    supabase.from('anuncios').select('*').eq('produto_id', produtoId),
    supabase.from('produtos').select('ficha, gtin').eq('id', produtoId).single(),
  ])
  const falha = [abertos, anuncios, prod].find((r) => r.error)?.error
  if (falha) throw new Error(`Não foi possível carregar o perfume: ${falha.message}`)
  const p = (prod.data ?? {}) as { ficha?: Ficha | null; gtin?: string | null }
  const mlAberto = ((abertos.data ?? []) as { ml_restante: number }[])
    .reduce((s, f) => s.add(f.ml_restante ?? 0), new Decimal(0)).toNumber()
  return {
    mlAberto, ficha: p.ficha ?? {}, gtin: p.gtin ?? '',
    anuncios: ((anuncios.data ?? []) as AnuncioDb[]).map((a) => ({ ...a, ml: num(a.ml), margem: num(a.margem) })),
  }
}
