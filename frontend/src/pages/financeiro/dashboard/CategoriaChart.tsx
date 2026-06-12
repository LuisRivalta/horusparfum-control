import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatBRL } from '@/lib/utils'
import type { FatiaCategoria } from '@/lib/financeiro'

interface Props {
  data: FatiaCategoria[]
  titulo: string
}

export function CategoriaChart({ data, titulo }: Props) {
  return (
    <div className="border border-line rounded-xl p-5 bg-surface">
      <h3 className="font-mono text-[0.62rem] uppercase tracking-[.16em] text-muted mb-4">{titulo}</h3>
      {data.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center">
          <p className="font-serif italic text-muted">Sem dados no período</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis type="number" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              type="category" dataKey="categoria" width={110}
              stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false}
            />
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
            <Bar dataKey="total" name="Total" fill="var(--color-gold)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
