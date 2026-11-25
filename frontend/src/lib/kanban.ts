export type Status = 'a_fazer' | 'fazendo' | 'feito'

export const COLUNAS: { status: Status; titulo: string }[] = [
  { status: 'a_fazer', titulo: 'A fazer' },
  { status: 'fazendo', titulo: 'Fazendo' },
  { status: 'feito', titulo: 'Feito' },
]

export type Prioridade = 'alta' | 'media' | 'baixa'

export const PRIORIDADES: { valor: Prioridade; titulo: string }[] = [
  { valor: 'alta', titulo: 'Alta' },
  { valor: 'media', titulo: 'Média' },
  { valor: 'baixa', titulo: 'Baixa' },
]

const peso = (p: Prioridade) => PRIORIDADES.findIndex((x) => x.valor === p)

export interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  prazo: string | null // aaaa-mm-dd
  status: Status
  prioridade: Prioridade
  ordem: number
}

/** Por coluna: Alta em cima; mesma prioridade, pela ordem manual. */
export function agrupar(ts: Tarefa[]): Record<Status, Tarefa[]> {
  const g: Record<Status, Tarefa[]> = { a_fazer: [], fazendo: [], feito: [] }
  const ord = [...ts].sort((a, b) => peso(a.prioridade) - peso(b.prioridade) || a.ordem - b.ordem)
  for (const x of ord) g[x.status].push(x)
  return g
}

/**
 * Ordem ao soltar `movida` antes de `antesDeId` numa coluna já agrupada.
 * Não pula de prioridade: alvo de prioridade mais alta = 1º do grupo; mais baixa ou vazio = fim.
 */
export function ordemNoGrupo(coluna: Tarefa[], antesDeId: string | null, movida: Pick<Tarefa, 'id' | 'prioridade'>): number {
  const grupo = coluna.filter((x) => x.prioridade === movida.prioridade)
  const alvo = coluna.find((x) => x.id === antesDeId)
  let antes: string | null = null
  if (alvo?.prioridade === movida.prioridade) antes = alvo.id
  else if (alvo && peso(alvo.prioridade) < peso(movida.prioridade)) antes = grupo.find((x) => x.id !== movida.id)?.id ?? null
  return ordemAoSoltar(grupo, antes, movida.id)
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
