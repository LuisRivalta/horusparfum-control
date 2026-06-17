import Decimal from 'decimal.js'

export function podeFrasco(
  produto: { estoque_atual: number },
  abertos: { id: string }[]
): boolean {
  return produto.estoque_atual > 0 && abertos.length === 0
}

export function calcularNovoML(mlRestante: number, mlDecant: number): number | null {
  if (mlDecant <= 0) return null
  const resultado = mlRestante - mlDecant
  return resultado < 0 ? null : resultado
}

export function statusAposDecant(novoML: number): 'ativo' | 'esgotado' {
  return novoML <= 0 ? 'esgotado' : 'ativo'
}

export interface ConsumoDecant {
  classificacao: string | null
  custo: number
  created_at: string
}

export interface FatiaConsumo {
  classificacao: string
  label: string
  total: number
}

const LABELS: Record<string, string> = {
  perda: 'Perda', amostra: 'Amostra', brinde: 'Brinde',
  marketing: 'Marketing', uso_interno: 'Uso interno', outro: 'Outro',
  sem: 'Sem classificação',
}

export function resumoConsumo(decants: ConsumoDecant[], inicio: Date, fim: Date): FatiaConsumo[] {
  const mapa = new Map<string, Decimal>()
  for (const d of decants) {
    const t = new Date(d.created_at)
    if (t < inicio || t > fim) continue
    const key = d.classificacao ?? 'sem'
    mapa.set(key, (mapa.get(key) ?? new Decimal(0)).add(d.custo))
  }
  return Array.from(mapa.entries())
    .map(([classificacao, total]) => ({
      classificacao,
      label: LABELS[classificacao] ?? classificacao,
      total: total.toDecimalPlaces(2).toNumber(),
    }))
    .sort((a, b) => b.total - a.total)
}
