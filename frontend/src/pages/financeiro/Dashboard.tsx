import { Icon } from '@/components/shared/Icon'

const STATS = [
  { label: 'Saldo atual', icon: 'dashboard' },
  { label: 'Receita — Junho', icon: 'up' },
  { label: 'Despesas — Junho', icon: 'down' },
  { label: 'Lucro — Junho', icon: 'goal' },
] as const

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

export function FinDashboard() {
  return (
    <div className="flex flex-col gap-6 stagger">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
          <span className="w-1 h-1 bg-gold rotate-45" />
          Financeiro / Visão geral
        </p>
        <h1 className="text-4xl tracking-tight mt-1.5">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            onMouseMove={trackMouse}
            className="glow-card gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[0.62rem] text-muted uppercase tracking-[.14em]">{stat.label}</span>
              <span className="w-8 h-8 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-gold/70">
                <Icon name={stat.icon} size={15} />
              </span>
            </div>
            <span className="text-3xl font-light tabular-nums tracking-tight">—</span>
            <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
          </div>
        ))}
      </div>

      <div className="border border-dashed border-line rounded-xl px-6 py-10 text-center">
        <p className="font-serif italic text-lg text-muted">Conecte o Supabase para ver dados reais.</p>
        <p className="font-mono text-[0.62rem] uppercase tracking-[.18em] text-faint mt-2">Gráficos de evolução em breve</p>
      </div>
    </div>
  )
}
