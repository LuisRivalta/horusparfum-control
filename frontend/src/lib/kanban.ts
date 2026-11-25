export type Status = 'a_fazer' | 'fazendo' | 'feito'

export const COLUNAS: { status: Status; titulo: string }[] = [
  { status: 'a_fazer', titulo: 'A fazer' },
  { status: 'fazendo', titulo: 'Fazendo' },
  { status: 'feito', titulo: 'Feito' },
]

export interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  prazo: string | null // aaaa-mm-dd
  status: Status
  ordem: number
}

export function agrupar(ts: Tarefa[]): Record<Status, Tarefa[]> {
  const g: Record<Status, Tarefa[]> = { a_fazer: [], fazendo: [], feito: [] }
  for (const x of [...ts].sort((a, b) => a.ordem - b.ordem)) g[x.status].push(x)
  return g
}

/** Ordem para a tarefa solta antes de `antesDeId` (ou no fim, se null). Uma linha só muda. */
export function ordemAoSoltar(coluna: Tarefa[], antesDeId: string | null, movidaId: string): number {
  const resto = coluna.filter((x) => x.id !== movidaId)
  if (resto.length === 0) return 0
  const i = antesDeId ? resto.findIndex((x) => x.id === antesDeId) : -1
  if (i < 0) return resto[resto.length - 1].ordem + 1
  if (i === 0) return resto[0].ordem - 1
  return (resto[i - 1].ordem + resto[i].ordem) / 2
}

export function situacaoPrazo(t: Tarefa, hoje: string): 'atrasado' | 'hoje' | null {
  if (!t.prazo || t.status === 'feito') return null
  if (t.prazo < hoje) return 'atrasado'
  return t.prazo === hoje ? 'hoje' : null
}

export function hojeLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
