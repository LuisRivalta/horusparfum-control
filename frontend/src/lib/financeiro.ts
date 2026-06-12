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
