export function FinDashboard() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro / Visão geral</p>
        <h1 className="text-3xl font-medium tracking-tight mt-1">Dashboard</h1>
      </div>
      <div className="grid grid-cols-4 gap-5">
        {['Saldo atual', 'Receita — Junho', 'Despesas — Junho', 'Lucro — Junho'].map((label) => (
          <div key={label} className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-2">
            <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-light tabular-nums">—</span>
          </div>
        ))}
      </div>
      <p className="text-muted text-sm">Conecte o Supabase para ver dados reais.</p>
    </div>
  )
}
