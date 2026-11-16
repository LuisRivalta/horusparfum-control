import Decimal from 'decimal.js'
import { listaDoItem, listaEnvio, custoInsumos, type ListaInsumos } from '@/lib/insumos'

export type TipoAnuncio = 'frasco' | 'decant'
export interface AlvoAnuncio { tipo: TipoAnuncio; ml: number | null }
export interface Foto { id: string; url: string; uso: 'frasco' | 'decant'; ordem: number }

export const AVISO = 'Aviso: '
export const AVISO_FOTO_BRANCA = 'Aviso: Confira se a 1ª foto tem fundo branco'
export const AVISO_SEM_GTIN = 'Aviso: Frasco sem código de barras (perde nota)'
const MAX_FOTOS = 12
const MAX_TITULO = 150

export function chaveAnuncio(a: AlvoAnuncio): string {
  return a.tipo === 'frasco' ? 'frasco' : `decant-${a.ml}`
}

export function custoAnuncio(
  p: { custoMedio: number; volumeMl: number | null }, a: AlvoAnuncio,
  listas: ListaInsumos[], custoPorInsumo: Record<string, number>,
): { custo: number } | { bloqueio: string } {
  if (!(p.custoMedio > 0)) return { bloqueio: 'Perfume sem custo médio' }
  const tipo = a.tipo === 'frasco' ? 'produto' : 'decant'
  let base = new Decimal(p.custoMedio)
  if (a.tipo === 'decant') {
    if (!a.ml || a.ml <= 0) return { bloqueio: 'Tamanho do decant inválido' }
    if (!p.volumeMl) return { bloqueio: 'Perfume sem volume (ml)' }
    base = base.div(p.volumeMl).mul(a.ml)
  }
  const insumos = custoInsumos(
    [...listaDoItem(listas, tipo, a.ml, 1), ...listaEnvio(listas, [tipo], true)], custoPorInsumo,
  )
  return { custo: base.add(insumos).toDecimalPlaces(2).toNumber() }
}

const fmtMl = (n: number) => String(n).replace('.', ',')
const ABREV: Record<string, string> = { 'Eau de Parfum': 'EDP', 'Eau de Toilette': 'EDT' }

export function tituloPadrao(
  f: { marca: string; nome: string; tipoPerfume?: string; genero?: string }, a: AlvoAnuncio, volumeMl: number | null,
): string {
  const decant = a.tipo === 'decant'
  const ml = decant ? a.ml : volumeMl
  const tipo = f.tipoPerfume && decant ? (ABREV[f.tipoPerfume] ?? f.tipoPerfume) : f.tipoPerfume
  return [decant ? 'Decant' : 'Perfume', f.marca, f.nome, tipo, ml ? `${fmtMl(ml)}ml` : '', f.genero]
    .filter(Boolean).join(' ').slice(0, MAX_TITULO)
}

export function limparDescricao(t: string): string {
  return t.replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/[<>]/g, '')
}

export function limparTitulo(t: string): string {
  return limparDescricao(t).replace(/\s+/g, ' ').trim()
}

const CAMPOS_DESCRICAO: Array<[string, string]> = [
  ['marca', 'Marca'], ['nome', 'Perfume'], ['volume', 'Volume'], ['tipo', 'Tipo'], ['genero', 'Gênero'], ['notas', 'Notas'], ['familias', 'Famílias olfativas'],
]

export function descricaoPadrao(modelo: string, dados: Record<string, string>): string {
  const texto = modelo.trim()
    ? modelo.replace(/\{(\w+)\}/g, (_, k: string) => dados[k] ?? '')
    : CAMPOS_DESCRICAO.filter(([k]) => dados[k]).map(([k, r]) => `${r}: ${dados[k]}`).join('\n')
  return limparDescricao(texto)
}

export function fotosDoAnuncio(fotos: Foto[], a: AlvoAnuncio): string[] {
  const por = (uso: Foto['uso']) => fotos.filter((f) => f.uso === uso).sort((x, y) => x.ordem - y.ordem).map((f) => f.url)
  if (a.tipo === 'frasco') return por('frasco').slice(0, MAX_FOTOS)
  const decant = por('decant') // reserva lugar para até 2 fotos do decant
  return [...por('frasco').slice(0, MAX_FOTOS - Math.min(decant.length, 2)), ...decant].slice(0, MAX_FOTOS)
}

export function quantidadeDisponivel(
  p: { estoqueAtual: number; volumeMl: number | null }, mlAberto: number, a: AlvoAnuncio,
): number {
  const lacrados = Math.max(p.estoqueAtual, 0)
  if (a.tipo === 'frasco' || !a.ml || a.ml <= 0) return lacrados
  const total = new Decimal(lacrados).mul(p.volumeMl ?? 0).add(mlAberto)
  return Math.max(total.div(a.ml).floor().toNumber(), 0)
}

export function pendencias(a: {
  titulo: string; descricao: string; fotos: string[]; ficha: Record<string, unknown>
  gtin: string | null; tipo: TipoAnuncio; preco: number | null
}): string[] {
  const tem = (k: string) => {
    const v = a.ficha[k] as { value_name?: unknown } | undefined
    return typeof v?.value_name === 'string' && v.value_name.trim() !== ''
  }
  const out: string[] = []
  if (!['BRAND', 'PERFUME_NAME', 'UNIT_VOLUME'].every(tem)) out.push('Ficha: falta marca/nome/volume')
  if (a.fotos.length === 0) out.push('Sem fotos')
  if (a.fotos.length > MAX_FOTOS) out.push(`Fotos demais (máx. ${MAX_FOTOS})`)
  if (!a.titulo.trim()) out.push('Título vazio')
  else if (a.titulo.length > MAX_TITULO) out.push(`Título acima de ${MAX_TITULO} caracteres`)
  if (!a.descricao.trim()) out.push('Descrição vazia')
  if (a.preco == null) out.push('Preço não definido')
  if (a.tipo === 'frasco' && !a.gtin) out.push(AVISO_SEM_GTIN)
  out.push(AVISO_FOTO_BRANCA)
  return out
}

export const bloqueia = (p: string[]): boolean => p.some((x) => !x.startsWith(AVISO))
