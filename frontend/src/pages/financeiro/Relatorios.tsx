import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { cn, formatBRL } from '@/lib/utils'
import {
  calcularSaldoHistorico,
  resumoPeriodo,
  agruparPorCategoria,
  periodoMes,
  type FatiaCategoria,
  type Periodo,
  type Transacao,
} from '@/lib/financeiro'
import { PeriodSelector } from './dashboard/PeriodSelector'

interface TransacaoRelatorio extends Transacao {
  forma_pagamento: string | null
  responsavel: string | null
  origem?: string | null
}

interface StatCardProps {
  label: string
  icon: string
  valor: string
  negativo?: boolean
}

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function StatCard({ label, icon, valor, negativo }: StatCardProps) {
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
      <span className={cn('text-3xl font-light tabular-nums tracking-tight', negativo && 'text-down')}>
        {valor}
      </span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
    </div>
  )
}

function dentroDoPeriodo(t: Transacao, periodo: Periodo) {
  const data = new Date(t.created_at)
  return data >= periodo.inicio && data <= periodo.fim
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function percentual(valor: number, total: number) {
  if (total <= 0) return '0%'
  return `${((valor / total) * 100).toFixed(0)}%`
}

function origemLabel(origem?: string | null) {
  if (origem === 'venda') return 'Venda'
  if (origem === 'decant') return 'Decant'
  return 'Manual'
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function CategoriaTable({
  titulo,
  total,
  itens,
}: {
  titulo: string
  total: number
  itens: FatiaCategoria[]
}) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{titulo}</h2>
        <span className="font-mono text-xs text-muted">{formatBRL(total)}</span>
      </div>
      {itens.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted text-sm">Sem lançamentos no período</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 font-medium text-text-2">Categoria</th>
                <th className="text-right px-4 py-3 font-medium text-text-2">Total</th>
                <th className="text-right px-4 py-3 font-medium text-text-2">Peso</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.categoria} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{item.categoria}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBRL(item.total)}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">{percentual(item.total, total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function criarHtmlRelatorio(
  periodo: Periodo,
  resumo: { receita: number; despesa: number; lucro: number },
  saldo: number,
  receitas: FatiaCategoria[],
  despesas: FatiaCategoria[],
  transacoes: TransacaoRelatorio[],
) {
  const linhas = transacoes.map((t) => `
    <tr>
      <td>${formatDate(t.created_at)}</td>
      <td>${escapeHtml(t.descricao)}</td>
      <td>${t.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
      <td>${escapeHtml(t.categoria || '-')}</td>
      <td>${origemLabel(t.origem)}</td>
      <td class="num">${t.tipo === 'saida' ? '-' : ''}${formatBRL(t.valor)}</td>
    </tr>
  `).join('')
  const cats = (titulo: string, itens: FatiaCategoria[]) => `
    <h2>${escapeHtml(titulo)}</h2>
    <table>
      <thead><tr><th>Categoria</th><th class="num">Total</th></tr></thead>
      <tbody>${itens.map((i) => `<tr><td>${escapeHtml(i.categoria)}</td><td class="num">${formatBRL(i.total)}</td></tr>`).join('')}</tbody>
    </table>
  `

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Relatório financeiro - ${escapeHtml(periodo.label)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1a1407; padding: 32px; }
    h1 { margin: 0 0 4px; font-size: 28px; }
    h2 { margin: 28px 0 10px; font-size: 16px; }
    .muted { color: #6b6254; margin-bottom: 24px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 22px 0; }
    .card { border: 1px solid #ddd2bd; border-radius: 8px; padding: 14px; }
    .label { color: #6b6254; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .value { font-size: 20px; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e8dfcd; padding: 8px; text-align: left; }
    th { color: #6b6254; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Relatório financeiro</h1>
  <div class="muted">${escapeHtml(periodo.label)}</div>
  <div class="cards">
    <div class="card"><div class="label">Receita</div><div class="value">${formatBRL(resumo.receita)}</div></div>
    <div class="card"><div class="label">Despesas</div><div class="value">${formatBRL(resumo.despesa)}</div></div>
    <div class="card"><div class="label">Lucro</div><div class="value">${formatBRL(resumo.lucro)}</div></div>
    <div class="card"><div class="label">Saldo histórico</div><div class="value">${formatBRL(saldo)}</div></div>
  </div>
  ${cats('Receitas por categoria', receitas)}
  ${cats('Despesas por categoria', despesas)}
  <h2>Lançamentos do período</h2>
  <table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Origem</th><th class="num">Valor</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="6">Sem lançamentos no período</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export function FinRelatorios() {
  const hoje = new Date()
  const [periodo, setPeriodo] = useState<Periodo>(periodoMes(hoje.getFullYear(), hoje.getMonth()))
  const [transacoes, setTransacoes] = useState<TransacaoRelatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('transacoes')
      .select('id, descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setTransacoes((data as TransacaoRelatorio[]) || [])
        setLoading(false)
      })
  }, [])

  const saldo = calcularSaldoHistorico(transacoes)
  const resumo = resumoPeriodo(transacoes, periodo)
  const receitas = agruparPorCategoria(transacoes, periodo, 'entrada')
  const despesas = agruparPorCategoria(transacoes, periodo, 'saida')
  const noPeriodo = useMemo(
    () => transacoes.filter((t) => dentroDoPeriodo(t, periodo)),
    [periodo, transacoes],
  )
  const maioresReceitas = noPeriodo
    .filter((t) => t.tipo === 'entrada')
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
  const maioresDespesas = noPeriodo
    .filter((t) => t.tipo === 'saida')
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
  const origens = noPeriodo.reduce<Record<string, number>>((acc, t) => {
    const key = origemLabel(t.origem)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  function imprimirPdf() {
    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.write(criarHtmlRelatorio(periodo, resumo, saldo, receitas, despesas, noPeriodo))
    janela.document.close()
    janela.focus()
    janela.print()
  }

  const cardValor = (valor: string) => (loading ? '—' : valor)

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
            <span className="w-1 h-1 bg-gold rotate-45" />
            Financeiro / Relatórios
          </p>
          <h1 className="text-4xl tracking-tight mt-1.5">Relatórios financeiros</h1>
          <p className="text-muted text-sm mt-1">Análise por período, categorias e origem dos lançamentos</p>
        </div>
        <Button variant="secondary" onClick={imprimirPdf} disabled={loading}>
          <Icon name="download" size={16} />
          Exportar PDF
        </Button>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          Erro ao carregar transações: {erro}
        </div>
      )}

      <PeriodSelector value={periodo} onChange={setPeriodo} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Receita" icon="up" valor={cardValor(formatBRL(resumo.receita))} />
        <StatCard label="Despesas" icon="down" valor={cardValor(formatBRL(resumo.despesa))} />
        <StatCard label="Lucro" icon="goal" valor={cardValor(formatBRL(resumo.lucro))} negativo={!loading && resumo.lucro < 0} />
        <StatCard label="Saldo histórico" icon="dashboard" valor={cardValor(formatBRL(saldo))} negativo={!loading && saldo < 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <CategoriaTable titulo="Receitas por categoria" total={resumo.receita} itens={receitas} />
        <CategoriaTable titulo="Despesas por categoria" total={resumo.despesa} itens={despesas} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="border border-line rounded-xl bg-surface/40 p-4">
          <p className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-faint mb-3">Origem dos lançamentos</p>
          {Object.keys(origens).length === 0 ? (
            <p className="text-sm text-muted">Sem lançamentos no período</p>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(origens).map(([origem, qtd]) => (
                <div key={origem} className="flex items-center justify-between text-sm">
                  <span className="text-text-2">{origem}</span>
                  <span className="font-mono">{qtd}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 border border-line rounded-xl overflow-hidden bg-surface/40">
          <div className="px-4 py-3 border-b border-line bg-surface flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Maiores lançamentos</h2>
            <span className="font-mono text-xs text-muted">{noPeriodo.length} no período</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <Ranking titulo="Receitas" transacoes={maioresReceitas} />
            <Ranking titulo="Despesas" transacoes={maioresDespesas} />
          </div>
        </div>
      </div>

      <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
        <div className="px-4 py-3 border-b border-line bg-surface flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Lançamentos do período</h2>
          <span className="font-mono text-xs text-muted">{periodo.label}</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-4 py-3 font-medium text-text-2">Data</th>
              <th className="text-left px-4 py-3 font-medium text-text-2">Descrição</th>
              <th className="text-left px-4 py-3 font-medium text-text-2">Categoria</th>
              <th className="text-left px-4 py-3 font-medium text-text-2">Origem</th>
              <th className="text-right px-4 py-3 font-medium text-text-2">Valor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : noPeriodo.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum lançamento no período</td></tr>
            ) : (
              noPeriodo.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{t.descricao}</td>
                  <td className="px-4 py-3 text-text-2">{t.categoria || 'Sem categoria'}</td>
                  <td className="px-4 py-3 text-text-2">{origemLabel(t.origem)}</td>
                  <td className={cn(
                    'px-4 py-3 text-right font-mono',
                    t.tipo === 'entrada' ? 'text-up' : 'text-down'
                  )}>
                    {t.tipo === 'saida' ? '- ' : ''}{formatBRL(t.valor)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function Ranking({ titulo, transacoes }: { titulo: string; transacoes: TransacaoRelatorio[] }) {
  return (
    <div className="p-4 border-b md:border-b-0 md:border-r border-line last:border-r-0">
      <p className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-faint mb-3">{titulo}</p>
      {transacoes.length === 0 ? (
        <p className="text-sm text-muted">Sem dados</p>
      ) : (
        <div className="flex flex-col gap-2">
          {transacoes.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-text-2">{t.descricao}</span>
              <span className="font-mono shrink-0">{formatBRL(t.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
