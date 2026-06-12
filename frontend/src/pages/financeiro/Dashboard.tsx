import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn, formatBRL } from '@/lib/utils'
import {
  calcularSaldoHistorico,
  resumoPeriodo,
  agruparPorCategoria,
  evolucaoMensal,
  periodoMes,
  type Transacao,
  type Periodo,
} from '@/lib/financeiro'
import { PeriodSelector } from './dashboard/PeriodSelector'
import { EvolucaoChart } from './dashboard/EvolucaoChart'
import { CategoriaChart } from './dashboard/CategoriaChart'

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function StatCard({ label, icon, valor, negativo }: { label: string; icon: string; valor: string; negativo?: boolean }) {
  return (
    <div
      onMouseMove={trackMouse}
      className="glow-card gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:-translate-y-1"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.62rem] text-muted uppercase tracking-[.14em]">{label}</span>
        <span className="w-8 h-8 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-gold/70">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <span className={cn('text-3xl font-light tabular-nums tracking-tight', negativo && 'text-down')}>{valor}</span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
    </div>
  )
}

export function FinDashboard() {
  const hoje = new Date()
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>(periodoMes(hoje.getFullYear(), hoje.getMonth()))
  const [catTipo, setCatTipo] = useState<'entrada' | 'saida'>('saida')

  useEffect(() => {
    supabase
      .from('transacoes')
      .select('*')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setTransacoes((data as Transacao[]) || [])
        setLoading(false)
      })
  }, [])

  const saldo = calcularSaldoHistorico(transacoes)
  const resumo = resumoPeriodo(transacoes, periodo)
  const evolucao = evolucaoMensal(transacoes, hoje, 6)
  const categorias = agruparPorCategoria(transacoes, periodo, catTipo)

  const cardValor = (n: number) => (loading ? '—' : formatBRL(n))

  return (
    <div className="flex flex-col gap-6 stagger">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
          <span className="w-1 h-1 bg-gold rotate-45" />
          Financeiro / Visão geral
        </p>
        <h1 className="text-4xl tracking-tight mt-1.5">Dashboard</h1>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          Erro ao carregar transações: {erro}
        </div>
      )}

      <PeriodSelector value={periodo} onChange={setPeriodo} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Saldo histórico" icon="dashboard" valor={cardValor(saldo)} negativo={!loading && saldo < 0} />
        <StatCard label="Receita" icon="up" valor={cardValor(resumo.receita)} />
        <StatCard label="Despesas" icon="down" valor={cardValor(resumo.despesa)} />
        <StatCard label="Lucro" icon="goal" valor={cardValor(resumo.lucro)} negativo={!loading && resumo.lucro < 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <EvolucaoChart data={evolucao} />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 self-end p-0.5 border border-line-2 rounded-xl bg-surface-2">
            <button
              onClick={() => setCatTipo('saida')}
              aria-pressed={catTipo === 'saida'}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                catTipo === 'saida' ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              Despesas
            </button>
            <button
              onClick={() => setCatTipo('entrada')}
              aria-pressed={catTipo === 'entrada'}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                catTipo === 'entrada' ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              Receitas
            </button>
          </div>
          <CategoriaChart
            data={categorias}
            titulo={catTipo === 'saida' ? 'Despesas por categoria' : 'Receitas por categoria'}
          />
        </div>
      </div>
    </div>
  )
}
