import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { formatBRL } from '@/lib/utils'
import type { PontoEvolucao } from '@/lib/financeiro'

interface Props {
  data: PontoEvolucao[]
}

export function EvolucaoChart({ data }: Props) {
  return (
    <div className="border border-line rounded-xl p-5 bg-surface">
      <h3 className="font-mono text-[0.62rem] uppercase tracking-[.16em] text-muted mb-4">
        Evolução — últimos 6 meses
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="mes" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            formatter={(v) => formatBRL(Number(v))}
            contentStyle={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-line)',
              borderRadius: 8,
              fontSize: 12,
            }}
            cursor={{ fill: 'var(--color-gold)', opacity: 0.06 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="receita" name="Receita" fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="despesa" name="Despesa" fill="var(--color-down)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
