import Decimal from 'decimal.js'

export type TipoMov = 'entrada' | 'saida'

export interface MovimentacaoGiro {
  tipo: TipoMov
  quantidade: number
}

export interface GiroProduto {
  saidas: number
  entradas: number
  estoqueInicio: number
  estoqueMedio: number
  giro: number | null
  coberturaDias: number | null
  parado: boolean
}

export function calcularGiroProduto(
  estoqueAtual: number,
  movs: MovimentacaoGiro[],
  dias: number,
): GiroProduto {
  const saidas = movs
    .filter((m) => m.tipo === 'saida')
    .reduce((soma, m) => soma + m.quantidade, 0)
  const entradas = movs
    .filter((m) => m.tipo === 'entrada')
    .reduce((soma, m) => soma + m.quantidade, 0)
  const estoqueInicio = estoqueAtual - entradas + saidas
  const estoqueMedio = (estoqueInicio + estoqueAtual) / 2
  const giro = estoqueMedio > 0 ? saidas / estoqueMedio : null
  const coberturaDias = saidas > 0 ? (estoqueAtual * dias) / saidas : null
  const parado = estoqueAtual > 0 && saidas === 0

  return { saidas, entradas, estoqueInicio, estoqueMedio, giro, coberturaDias, parado }
}

export interface GiroDecant {
  coberturaDias: number | null
  parado: boolean
}

export function calcularGiroDecant(mlRestante: number, mlConsumido: number, dias: number): GiroDecant {
  const coberturaDias = mlConsumido > 0 ? (mlRestante * dias) / mlConsumido : null
  const parado = mlRestante > 0 && mlConsumido === 0

  return { coberturaDias, parado }
}

export interface LinhaGiro {
  estoqueAtual: number
  custoMedio: number
  giro: number | null
  coberturaDias: number | null
  parado: boolean
}

export interface ResumoGiro {
  giroMedio: number | null
  qtdParados: number
  valorEncalhado: number
  coberturaMedia: number | null
}

function media(valores: number[]): number | null {
  return valores.length > 0 ? valores.reduce((soma, valor) => soma + valor, 0) / valores.length : null
}

export function resumoGiro(linhas: LinhaGiro[]): ResumoGiro {
  const giros = linhas.map((l) => l.giro).filter((giro): giro is number => giro !== null)
  const coberturas = linhas
    .map((l) => l.coberturaDias)
    .filter((cobertura): cobertura is number => cobertura !== null)
  const parados = linhas.filter((l) => l.parado)
  const valorEncalhado = parados
    .reduce((total, l) => total.plus(new Decimal(l.estoqueAtual).times(l.custoMedio)), new Decimal(0))
    .toNumber()

  return {
    giroMedio: media(giros),
    qtdParados: parados.length,
    valorEncalhado,
    coberturaMedia: media(coberturas),
  }
}

export type OrdemGiro =
  | 'giro_desc'
  | 'giro_asc'
  | 'cobertura_asc'
  | 'cobertura_desc'
  | 'saidas_desc'
  | 'az'

interface OrdenavelGiro {
  nome: string
  giro: number | null
  coberturaDias: number | null
  saidas: number
}

function compararNumero(a: number | null, b: number | null, direcao: 'asc' | 'desc') {
  const valor = (n: number | null) => {
    if (n !== null) return n
    return direcao === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  }
  const av = valor(a)
  const bv = valor(b)

  return direcao === 'asc' ? av - bv : bv - av
}

export function ordenarGiro<T extends OrdenavelGiro>(linhas: T[], ordem: OrdemGiro): T[] {
  return [...linhas].sort((a, b) => {
    switch (ordem) {
      case 'giro_desc':
        return compararNumero(a.giro, b.giro, 'desc')
      case 'giro_asc':
        return compararNumero(a.giro, b.giro, 'asc')
      case 'cobertura_asc':
        return compararNumero(a.coberturaDias, b.coberturaDias, 'asc')
      case 'cobertura_desc':
        return compararNumero(a.coberturaDias, b.coberturaDias, 'desc')
      case 'saidas_desc':
        return b.saidas - a.saidas
      case 'az':
        return a.nome.localeCompare(b.nome)
    }
  })
}
