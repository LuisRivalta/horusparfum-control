import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Icon } from '@/components/shared/Icon'
import { PeriodSelector } from '@/pages/financeiro/dashboard/PeriodSelector'
import { supabase } from '@/lib/supabase'
import { periodoMes, type Periodo } from '@/lib/financeiro'
import { cn, formatBRL } from '@/lib/utils'

interface ResumoDashboard {
  qtd_vendas: number
  itens_vendidos: number
  faturamento_bruto: number
  total_custo: number
  lucro_bruto: number
  margem_media: number
  roi_medio: number | null
  ticket_medio: number
}

interface PontoEvolucao {
  periodo: string
  label: string
  faturamento_bruto: number
  lucro_bruto: number
}

interface RankingProduto {
  produto_id: string
  nome: string
  quantidade: number
  faturamento_bruto: number
  lucro_bruto: number
  margem: number
  roi: number | null
}

interface RankingCanal {
  canal_id: string | null
  nome: string
  qtd_vendas: number
  faturamento_bruto: number
  lucro_bruto: number
  margem: number
  roi: number | null
}

interface VendaPeriodo {
  id: string
  numero: number
  data_venda: string
  canal: string
  itens: number
  faturamento_bruto: number
  total_custo: number
  lucro_bruto: number
  margem: number
  roi: number | null
}

interface DashboardVendasResponse {
  periodo: {
    inicio: string
    fim: string
  }
  resumo: ResumoDashboard
  evolucao: PontoEvolucao[]
  produtos: RankingProduto[]
  canais: RankingCanal[]
  vendas: VendaPeriodo[]
}

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function localDateTime(date: Date, endOfDay = false): string {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    endOfDay ? 'T23:59:59' : 'T00:00:00',
  ].join('')
}

function formatPercent(value: number | null): string {
  if (value === null) return '-'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

async function carregarDashboard(periodo: Periodo, signal: AbortSignal): Promise<DashboardVendasResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sessao expirada. Entre novamente para carregar o dashboard.')
  }

  const params = new URLSearchParams({
    inicio: localDateTime(periodo.inicio),
    fim: localDateTime(periodo.fim, true),
  })
  const response = await fetch(`${API_URL}/api/estoque/vendas/dashboard?${params.toString()}`, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || 'Erro ao carregar dashboard de vendas.')
  }

  return response.json()
}

function StatCard({
  label,
  icon,
  valor,
  negativo,
}: {
  label: string
  icon: string
  valor: string
  negativo?: boolean
}) {
  return (
    <div
      onMouseMove={trackMouse}
      className="glow-card gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:-translate-y-1"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[0.62rem] text-muted uppercase tracking-[.14em]">{label}</span>
        <span className="w-8 h-8 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-gold/70">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <span className={cn('text-3xl font-light tabular-nums tracking-tight', negativo && 'text-down')}>
        {valor}
      </span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
    </div>
  )
}

function RankingProdutos({ produtos }: { produtos: RankingProduto[] }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-muted">Produtos mais lucrativos</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 font-medium">Produto</th>
              <th className="text-right px-4 py-3 font-medium">Qtd</th>
              <th className="text-right px-4 py-3 font-medium">Bruto</th>
              <th className="text-right px-4 py-3 font-medium">Lucro</th>
              <th className="text-right px-4 py-3 font-medium">Margem</th>
              <th className="text-right px-4 py-3 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {produtos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum produto no periodo</td></tr>
            ) : produtos.map((produto) => (
              <tr key={produto.produto_id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">{produto.nome}</td>
                <td className="px-4 py-3 text-right font-mono">{produto.quantidade}</td>
                <td className="px-4 py-3 text-right font-mono">{formatBRL(produto.faturamento_bruto)}</td>
                <td className={cn('px-4 py-3 text-right font-mono', produto.lucro_bruto < 0 ? 'text-down' : 'text-up')}>
                  {formatBRL(produto.lucro_bruto)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(produto.margem)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(produto.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RankingCanais({ canais }: { canais: RankingCanal[] }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-muted">Canais mais lucrativos</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 font-medium">Canal</th>
              <th className="text-right px-4 py-3 font-medium">Vendas</th>
              <th className="text-right px-4 py-3 font-medium">Bruto</th>
              <th className="text-right px-4 py-3 font-medium">Lucro</th>
              <th className="text-right px-4 py-3 font-medium">Margem</th>
              <th className="text-right px-4 py-3 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {canais.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum canal no periodo</td></tr>
            ) : canais.map((canal) => (
              <tr key={canal.canal_id || canal.nome} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">{canal.nome}</td>
                <td className="px-4 py-3 text-right font-mono">{canal.qtd_vendas}</td>
                <td className="px-4 py-3 text-right font-mono">{formatBRL(canal.faturamento_bruto)}</td>
                <td className={cn('px-4 py-3 text-right font-mono', canal.lucro_bruto < 0 ? 'text-down' : 'text-up')}>
                  {formatBRL(canal.lucro_bruto)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(canal.margem)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(canal.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VendasPeriodoTable({ vendas }: { vendas: VendaPeriodo[] }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-muted">Vendas do periodo</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 font-medium">Venda</th>
              <th className="text-left px-4 py-3 font-medium">Data</th>
              <th className="text-left px-4 py-3 font-medium">Canal</th>
              <th className="text-right px-4 py-3 font-medium">Qtd.</th>
              <th className="text-right px-4 py-3 font-medium">Bruto</th>
              <th className="text-right px-4 py-3 font-medium">Custo</th>
              <th className="text-right px-4 py-3 font-medium">Lucro</th>
              <th className="text-right px-4 py-3 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {vendas.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhuma venda concluida no periodo</td></tr>
            ) : vendas.map((venda) => (
              <tr key={venda.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-mono text-muted">#{venda.numero}</td>
                <td className="px-4 py-3 text-text-2 text-xs">{formatDate(venda.data_venda)}</td>
                <td className="px-4 py-3 font-medium">{venda.canal}</td>
                <td className="px-4 py-3 text-right font-mono">{venda.itens}</td>
                <td className="px-4 py-3 text-right font-mono">{formatBRL(venda.faturamento_bruto)}</td>
                <td className="px-4 py-3 text-right font-mono text-text-2">{formatBRL(venda.total_custo)}</td>
                <td className={cn('px-4 py-3 text-right font-mono', venda.lucro_bruto < 0 ? 'text-down' : 'text-up')}>
                  {formatBRL(venda.lucro_bruto)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(venda.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function VendasDashboard() {
  const hoje = new Date()
  const [periodo, setPeriodo] = useState<Periodo>(periodoMes(hoje.getFullYear(), hoje.getMonth()))
  const [dashboard, setDashboard] = useState<DashboardVendasResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setErro(null)
    setDashboard(null)

    carregarDashboard(periodo, controller.signal)
      .then(setDashboard)
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setErro(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [periodo])

  const resumo = dashboard?.resumo
  const cardValor = (value: string) => (loading || !resumo ? '-' : value)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-medium tracking-tight">Dashboard de vendas</h2>
        <p className="text-muted text-sm mt-1">Faturamento, lucro, margem e ROI calculados no backend</p>
      </div>

      <PeriodSelector value={periodo} onChange={setPeriodo} />

      {erro && (
        <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Faturamento bruto" icon="cart" valor={cardValor(formatBRL(resumo?.faturamento_bruto ?? 0))} />
        <StatCard
          label="Lucro bruto"
          icon="goal"
          valor={cardValor(formatBRL(resumo?.lucro_bruto ?? 0))}
          negativo={!loading && (resumo?.lucro_bruto ?? 0) < 0}
        />
        <StatCard label="Margem media" icon="dashboard" valor={cardValor(formatPercent(resumo?.margem_media ?? 0))} />
        <StatCard label="ROI medio" icon="up" valor={cardValor(formatPercent(resumo?.roi_medio ?? null))} />
      </div>

      {resumo && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 rounded-xl border border-line bg-surface text-sm">
          <span className="flex items-center gap-1.5">
            <span className="text-muted">Ticket medio</span>
            <span className="font-mono">{formatBRL(resumo.ticket_medio)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted">Volume</span>
            <span className="font-mono">{resumo.qtd_vendas} vendas</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted">Itens</span>
            <span className="font-mono">{resumo.itens_vendidos} itens vendidos</span>
          </span>
        </div>
      )}

      {loading ? (
        <div role="status" className="px-4 py-10 text-center text-muted border border-line rounded-xl bg-surface/40">Carregando</div>
      ) : dashboard && (
        <>
          <div className="border border-line rounded-xl p-5 bg-surface">
            <h3 className="font-mono text-[0.62rem] uppercase tracking-[.16em] text-muted mb-4">
              Evolucao de vendas
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dashboard.evolucao} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value))}
                  contentStyle={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-line)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="faturamento_bruto" name="Faturamento" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lucro_bruto" name="Lucro" stroke="var(--color-up)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
            <RankingProdutos produtos={dashboard.produtos} />
            <RankingCanais canais={dashboard.canais} />
          </div>

          <VendasPeriodoTable vendas={dashboard.vendas} />
        </>
      )}
    </div>
  )
}
