import Decimal from 'decimal.js'

export interface Transacao {
  id: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  categoria: string | null
  created_at: string
}

export interface Periodo {
  inicio: Date
  fim: Date
  label: string
}

export interface ResumoPeriodo {
  receita: number
  despesa: number
  lucro: number
}

export interface VendaFinanceira {
  data_venda: string
  status: 'concluida' | 'cancelada'
  total_custo: number
}

export interface FatiaCategoria {
  categoria: string
  total: number
}

export interface PontoEvolucao {
  mes: string
  receita: number
  despesa: number
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function dd(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()}`
}

export function periodoMes(ano: number, mes: number): Periodo {
  return {
    inicio: new Date(ano, mes, 1, 0, 0, 0, 0),
    fim: new Date(ano, mes + 1, 0, 23, 59, 59, 999),
    label: `${MESES[mes]} ${ano}`,
  }
}

export function periodoTrimestre(ano: number, trimestre: number): Periodo {
  const mesInicial = (trimestre - 1) * 3
  return {
    inicio: new Date(ano, mesInicial, 1, 0, 0, 0, 0),
    fim: new Date(ano, mesInicial + 3, 0, 23, 59, 59, 999),
    label: `${trimestre}º trimestre ${ano}`,
  }
}

export function periodoAno(ano: number): Periodo {
  return {
    inicio: new Date(ano, 0, 1, 0, 0, 0, 0),
    fim: new Date(ano, 11, 31, 23, 59, 59, 999),
    label: `${ano}`,
  }
}

export function periodoPersonalizado(inicio: Date, fim: Date): Periodo {
  const i = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, 0, 0, 0)
  const f = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999)
  return { inicio: i, fim: f, label: `${dd(i)} – ${dd(f)}` }
}

function somar(valores: number[]): number {
  return valores
    .reduce((acc, v) => acc.add(v), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber()
}

function dentroDoPeriodo(t: Transacao, periodo: Periodo): boolean {
  const d = new Date(t.created_at)
  return d >= periodo.inicio && d <= periodo.fim
}

export function calcularSaldoHistorico(transacoes: Transacao[]): number {
  const entradas = somar(transacoes.filter(t => t.tipo === 'entrada').map(t => t.valor))
  const saidas = somar(transacoes.filter(t => t.tipo === 'saida').map(t => t.valor))
  return new Decimal(entradas).sub(saidas).toDecimalPlaces(2).toNumber()
}

export function resumoPeriodo(
  transacoes: Transacao[],
  periodo: Periodo,
  vendas: VendaFinanceira[] = []
): ResumoPeriodo {
  const noPeriodo = transacoes.filter(t => dentroDoPeriodo(t, periodo))
  const receita = somar(noPeriodo.filter(t => t.tipo === 'entrada').map(t => t.valor))
  const despesa = somar(noPeriodo.filter(t => t.tipo === 'saida').map(t => t.valor))
  const custoVendido = somar(
    vendas
      .filter(v => v.status === 'concluida' && dentroDoPeriodo({ created_at: v.data_venda + 'T00:00:00', tipo: 'entrada' } as Transacao, periodo))
      .map(v => v.total_custo)
  )
  const lucro = new Decimal(receita).sub(despesa).sub(custoVendido).toDecimalPlaces(2).toNumber()
  return { receita, despesa, lucro }
}

export function agruparPorCategoria(
  transacoes: Transacao[],
  periodo: Periodo,
  tipo: 'entrada' | 'saida'
): FatiaCategoria[] {
  const filtradas = transacoes.filter(t => t.tipo === tipo && dentroDoPeriodo(t, periodo))
  const mapa = new Map<string, number[]>()
  for (const t of filtradas) {
    const cat = t.categoria?.trim() || 'Sem categoria'
    const arr = mapa.get(cat) ?? []
    arr.push(t.valor)
    mapa.set(cat, arr)
  }
  return Array.from(mapa.entries())
    .map(([categoria, valores]) => ({ categoria, total: somar(valores) }))
    .sort((a, b) => b.total - a.total)
}

export function evolucaoMensal(
  transacoes: Transacao[],
  referencia: Date,
  nMeses = 6
): PontoEvolucao[] {
  const pontos: PontoEvolucao[] = []
  for (let i = nMeses - 1; i >= 0; i--) {
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    const periodo = periodoMes(d.getFullYear(), d.getMonth())
    const r = resumoPeriodo(transacoes, periodo)
    pontos.push({ mes: MESES_CURTOS[d.getMonth()], receita: r.receita, despesa: r.despesa })
  }
  return pontos
}
